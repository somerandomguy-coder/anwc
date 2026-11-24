import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { envelopeSchema } from '@anwc/protocol';
import {
  baselineCaptureSchema, baselineFindingSchema, computeStatesHash, computeSummaryHash, loadBaseline, parseCheckArguments, run, runCheckSuite, runtimeScript, stateManifestSchema,
  type CheckRunResult, type StateManifest
} from '../../packages/cli/src/index.js';

// Real browser, real runner: the page's HTML is swapped between the baseline and the second run.
const PAY = `<button data-anwc-key="pay" data-anwc-expect="interactive" style="width:160px;height:40px" onclick="document.querySelector('output').textContent='Paid'">Pay</button>`;
const OTHER = `<button id="other" style="width:160px;height:40px" onclick="document.querySelector('output').textContent='Paid'">Other</button>`;
const COOKIES = '<div style="position:absolute;inset:0;background:#333;color:#fff">Cookies</div>';
const page = (pay = PAY, overPay = '', overOther = '') => `<!doctype html><title>Shop</title><h1>Shop</h1><div style="position:relative;width:300px;height:60px">${pay}${overPay}</div><div style="position:relative;width:300px;height:60px">${OTHER}${overOther}</div><p><output>Nothing yet</output></p>`;
const CLICKABLE = page();
const BROKEN = page(PAY, COOKIES);

// Every test replays twice in Chromium, with one-second observation windows.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let server: Server;
let browser: Browser;
let baseUrl: string;
let html = BROKEN;
let tmp: string;

beforeAll(async () => {
  server = createServer((_request, response) => { response.setHeader('content-type', 'text/html'); response.end(html); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
beforeEach(async () => { html = BROKEN; tmp = await mkdtemp(join(tmpdir(), 'anwc-baseline-')); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

const PAID = { id: 'paid', description: 'payment shown', selector: 'output', expected: 'text-contains', expectedValue: 'Paid', proves: 'pay' };
const click = (selector: string) => ({ action: 'click', selector, timeoutMs: 700 });
function manifest(patch: { steps?: unknown[]; assertions?: unknown[]; viewport?: object } = {}): StateManifest {
  return stateManifestSchema.parse({
    schemaVersion: '0.1', baseUrl,
    scenarios: [{
      id: 's', title: 't', viewport: patch.viewport ?? { width: 800, height: 600 },
      checkpoints: [{
        name: 'pay',
        steps: [{ action: 'navigate', path: '/' }, { action: 'capture', name: 'shot', runtimeOnly: true }, ...(patch.steps ?? [click('[data-anwc-key=pay]')])],
        assertions: patch.assertions ?? [PAID]
      }]
    }]
  });
}
const before = () => join(tmp, 'before');
async function replay(m: StateManifest, options: { baseline?: boolean; loadWith?: StateManifest } = {}): Promise<CheckRunResult> {
  return runCheckSuite({
    manifest: m, manifestRaw: JSON.stringify(m), browser, runtimeScriptProvider: runtimeScript,
    outputDir: options.baseline ? join(tmp, 'after') : before(),
    ...(options.baseline ? { baseline: await loadBaseline(before(), options.loadWith ?? m) } : {})
  });
}
/** Records the broken baseline, swaps the page, replays with the baseline. */
async function repair(after: string, m = manifest(), tamper?: () => Promise<void>, second = m) {
  await replay(m);
  await tamper?.();
  html = after;
  const result = await replay(second, { baseline: true });
  return { result, baseline: result.baseline!, capture: result.baseline!.captures[0]!, checkpoint: result.scenarios[0]!.checkpoints[0]! };
}
const rows = (b: NonNullable<CheckRunResult['baseline']>) => b.captures.flatMap((c) => c.findings.map((f) => [f.code, f.verdict, f.reason]));
const edit = async (file: string, change: (json: any) => void, resign = false) => {
  const json = JSON.parse(await readFile(join(before(), file), 'utf8'));
  change(json);
  if (resign) json.summaryHash = computeSummaryHash(json);
  await writeFile(join(before(), file), JSON.stringify(json), 'utf8');
};

describe('check --baseline: verified', () => {
  test('a broken baseline is recorded: capture saved, click step timed out', async () => {
    const result = await replay(manifest());
    const checkpoint = result.scenarios[0]!.checkpoints[0]!;
    expect(result.passedAll).toBe(false);
    expect(checkpoint.steps.map((s) => s.status)).toEqual(['passed', 'passed', 'timed-out']);
    expect(checkpoint.behaviorEvidence).toMatchObject([{ reason: 'behavior_step_failed', step: 2, semanticKey: 'pay' }]);
    const saved = JSON.parse(await readFile(join(before(), 'shot.json'), 'utf8'));
    expect(saved.findings).toMatchObject([{ code: 'POINTER_BLOCKED_AT_SAMPLES' }]);
    const loaded = await loadBaseline(before(), manifest());
    expect(loaded.problem).toBeNull();
    expect(loaded.captures.size).toBe(1);
  });

  test('verified when the finding is gone and an unforced click on the same element turned the assertion', async () => {
    const { result, baseline, capture, checkpoint } = await repair(CLICKABLE);
    expect(rows(baseline)).toEqual([['POINTER_BLOCKED_AT_SAMPLES', 'verified', 'finding_absent_target_retained']]);
    expect(capture.findings[0]!.proof).toEqual({ step: 2, action: 'click', assertions: ['paid'], baselineStep: 'timed-out' });
    expect(checkpoint).toMatchObject({ passed: true, verdict: 'verified', reason: 'finding_absent_target_retained' });
    expect(baseline).toMatchObject({ valid: true, repairVerified: true, findingVerdicts: { verified: 1, unverified: 0, contradicted: 0 } });
    expect(result.verdictSummary.checkpoints.verified).toBe(1);
  });

  test('formatting and key order of the manifest do not matter', async () => {
    const m = manifest();
    const reordered = { ...m, scenarios: m.scenarios.map((s) => Object.fromEntries(Object.entries(s).reverse()) as typeof s) };
    expect(computeStatesHash(reordered)).toBe(computeStatesHash(m));
  });

  test('CLI: exit 1 for the baseline, 0 for the verified repair, JSON envelope throughout', async () => {
    const file = join(tmp, 'states.json');
    await writeFile(file, JSON.stringify(manifest()), 'utf8');
    const cli = async (...args: string[]) => {
      const out: string[] = [];
      const exit = await run(['check', file, ...args], { stdout: (m) => out.push(m), stderr: () => {} });
      return { exit, envelope: envelopeSchema.parse(JSON.parse(out.join(''))) as any };
    };
    expect((await cli('--output-dir', before())).exit).toBe(1);
    html = CLICKABLE;
    const fixed = await cli('--baseline', before(), '--output-dir', join(tmp, 'after'));
    expect(fixed.exit).toBe(0);
    expect(fixed.envelope.data.baseline.repairVerified).toBe(true);
    const missing = await cli('--baseline', join(tmp, 'nowhere'));
    expect(missing).toMatchObject({ exit: 2, envelope: { ok: false, error: { code: 'INVALID_USAGE', details: { kind: 'BASELINE_UNREADABLE' } } } });
    expect(() => parseCheckArguments(['check', file, '--baseline', before(), '--output', `${before()}/.`])).toThrow(/cannot also be the output/);
  }, 60_000);
});

describe('check --baseline: abuse cases are never verified', () => {
  const notVerified = (r: Awaited<ReturnType<typeof repair>>, reason: string, verdict = 'unverified') => {
    expect(r.baseline.repairVerified).toBe(false);
    expect(r.baseline.findingVerdicts.verified).toBe(0);
    expect(r.result.verdictSummary.checkpoints.verified).toBe(0);
    expect(r.capture).toMatchObject({ verdict, reason });
  };

  test('click on another element', async () => notVerified(await repair(CLICKABLE, manifest({ steps: [click('#other')] })), 'behavior_target_mismatch'));
  test('click on a child of the target', async () => notVerified(await repair(page(PAY.replace('>Pay<', '><span id="inner">Pay</span><')), manifest({ steps: [click('#inner')] })), 'behavior_target_mismatch'));
  /** After the capture returns, the page replaces the target with a clone that carries the same key. */
  const swapping = (delayMs: number) => `${CLICKABLE}<script>const wait = setInterval(() => { const real = window.__ANWC__; if (!real) return; clearInterval(wait); window.__ANWC__ = { ...real, capture: async (o) => { const c = await real.capture(o); setTimeout(() => { const el = document.querySelector('[data-anwc-key=pay]'); const clone = el.cloneNode(true); clone.classList.add('clone'); el.replaceWith(clone); }, ${delayMs}); return c; } }; }, 1);</script>`;
  test('an element that took over the key after the capture does not count', async () => {
    const m = manifest({ steps: [{ action: 'wait-for-selector', selector: '.clone', timeoutMs: 1500 }, click('[data-anwc-key=pay]')] });
    notVerified(await repair(swapping(200), m), 'behavior_target_mismatch');
  });
  test('a target replaced while it is being observed fails the step instead of retargeting it', async () => notVerified(await repair(swapping(500)), 'behavior_step_failed'));
  test('always-true assertion', async () => notVerified(await repair(CLICKABLE, manifest({ assertions: [{ ...PAID, selector: 'h1', expectedValue: 'Shop' }] })), 'behavior_unchanged'));
  test('assertion that becomes true by itself', async () => {
    const timer = `${CLICKABLE}<script>setTimeout(() => { document.querySelector('output').textContent = 'Paid'; }, 900)</script>`.replace(/onclick="[^"]*"/, '');
    notVerified(await repair(timer), 'behavior_unchanged');
  });
  test('no assertion, and an assertion not linked to the target', async () => {
    notVerified(await repair(CLICKABLE, manifest({ assertions: [] })), 'behavior_not_checked');
    const { proves: _unlinked, ...unlinked } = PAID;
    html = BROKEN;
    notVerified(await repair(CLICKABLE, manifest({ assertions: [unlinked] })), 'behavior_not_checked');
  });
  test('no interaction, or a navigation between capture and click', async () => {
    notVerified(await repair(CLICKABLE, manifest({ steps: [] })), 'behavior_assertion_failed', 'contradicted');
    html = BROKEN;
    notVerified(await repair(CLICKABLE, manifest({ steps: [{ action: 'navigate', path: '/' }, click('[data-anwc-key=pay]')] })), 'behavior_not_checked');
  });
  test('force and focus-only assertions are not expressible', () => {
    expect(() => manifest({ steps: [{ ...click('[data-anwc-key=pay]'), force: true }] })).toThrow(/force/);
    expect(() => manifest({ assertions: [{ ...PAID, selector: '[data-anwc-key=pay]:focus', expected: 'visible' }] })).toThrow(/:focus/);
    for (const flag of ['--verified', '--force', '--behavior', '--assume-verified']) expect(() => parseCheckArguments(['check', 'm.json', flag, 'true'])).toThrow(/Unknown or invalid option/);
  });
  test('runner sources never force an interaction or dispatch a synthetic one', async () => {
    for (const name of ['runner', 'behavior']) expect(await readFile(`packages/cli/src/${name}.ts`, 'utf8')).not.toMatch(/force\s*:|dispatchEvent|\.click\(\)/);
  });
  test('click does nothing: the assertion fails', async () => notVerified(await repair(CLICKABLE.replace(/onclick="[^"]*"/, '')), 'behavior_assertion_failed', 'contradicted'));
  test('a later step fails after the proof', async () => notVerified(await repair(CLICKABLE, manifest({ steps: [click('[data-anwc-key=pay]'), click('#gone')] })), 'behavior_step_failed'));
  test('a fill proves nothing about the pointer', async () => {
    const field = (s: string) => s.replace(/<button data-anwc-key="pay"(.*?)onclick=(".*?")>Pay<\/button>/, '<input aria-label="Pay" data-anwc-key="pay"$1oninput=$2>');
    html = field(BROKEN);
    const m = manifest({ steps: [{ action: 'fill', selector: '[data-anwc-key=pay]', text: 'x' }] });
    notVerified(await repair(field(CLICKABLE), m), 'behavior_not_provable');
  });
  test('non-pointer rule: a click does not prove visibility', async () => {
    html = CLICKABLE.replace('width:160px', 'display:none;width:160px');
    const r = await repair(CLICKABLE);
    notVerified(r, 'behavior_not_provable');
    expect(r.checkpoint.behaviorEvidence[0]!.reason).toBe('finding_absent_target_retained');
  });

  test.each<[string, () => Promise<void>]>([
    ['capture bytes edited', () => edit('shot.json', (j) => { j.page.title = 'x'; })],
    ['capture missing', () => rm(join(before(), 'shot.json'))],
    ['summary edited', () => edit('check-summary.json', (j) => { j.passedAll = true; })],
    ['summary from another producer', () => edit('check-summary.json', (j) => { delete j.producer; }, true)],
    ['summary not JSON', () => writeFile(join(before(), 'check-summary.json'), '{', 'utf8')],
    ['baseline newer than this run', () => edit('check-summary.json', (j) => { j.finishedAt = '2999-01-01T00:00:00.000Z'; }, true)],
    ['finding injected and everything re-hashed', async () => {
      const { createHash } = await import('node:crypto');
      await edit('shot.json', (j) => { j.findings[0].code = 'POINTER_PARTIALLY_BLOCKED'; });
      const sha = createHash('sha256').update(await readFile(join(before(), 'shot.json'))).digest('hex');
      await edit('check-summary.json', (j) => { j.scenarios[0].checkpoints[0].captures[0].sha256 = sha; }, true);
    }]
  ])('tampered baseline: %s', async (_label, tamper) => {
    const r = await repair(CLICKABLE, manifest(), tamper);
    notVerified(r, 'baseline_invalid');
    expect(r.baseline.valid).toBe(false);
    expect(r.checkpoint).toMatchObject({ passed: true, verdict: 'unverified', reason: 'baseline_invalid' });
  });

  test('different manifest, and different viewport', async () => {
    notVerified(await repair(CLICKABLE, manifest(), undefined, manifest({ assertions: [PAID, { ...PAID, id: 'extra' }] })), 'baseline_manifest_mismatch');
    html = BROKEN;
    const wide = manifest({ viewport: { width: 1000, height: 600 } });
    notVerified(await repair(CLICKABLE, manifest(), undefined, wide), 'baseline_manifest_mismatch');
    // Even if the manifest gate were bypassed, the captures themselves are not comparable.
    html = BROKEN;
    await replay(manifest());
    html = CLICKABLE;
    const bypassed = await replay(wide, { baseline: true, loadWith: manifest() });
    expect(bypassed.baseline!.captures[0]).toMatchObject({ verdict: 'unverified', reason: 'state_not_reproduced' });
  }, 30_000);

  test('unmounted and hidden targets are contradicted', async () => {
    notVerified(await repair(CLICKABLE.replace(/<button data-anwc-key="pay".*?<\/button>/, '')), 'target_unmounted', 'contradicted');
    html = BROKEN;
    notVerified(await repair(CLICKABLE.replace('width:160px', 'display:none;width:160px')), 'target_hidden', 'contradicted');
  }, 30_000);
  test('persisting finding', async () => notVerified(await repair(BROKEN), 'finding_persists', 'contradicted'));
  test('duplicate key is ambiguous', async () => notVerified(await repair(CLICKABLE.replace('id="other"', 'id="other" data-anwc-key="pay"')), 'target_ambiguous'));
  test('healthy both sides: no repair to verify', async () => {
    html = CLICKABLE;
    const r = await repair(CLICKABLE);
    notVerified(r, 'no_repair_to_verify');
    expect(r.checkpoint.passed).toBe(true);
  });
  test('new finding elsewhere: the repair gate fails although the original finding is verified', async () => {
    const r = await repair(page(PAY, '', COOKIES));
    expect(rows(r.baseline)).toEqual([
      ['POINTER_BLOCKED_AT_SAMPLES', 'verified', 'finding_absent_target_retained'],
      ['POINTER_BLOCKED_AT_SAMPLES', 'contradicted', 'new_finding']
    ]);
    expect(r.baseline.repairVerified).toBe(false);
    expect(r.capture.verdict).toBe('contradicted');
    expect(r.checkpoint).toMatchObject({ verdict: 'contradicted', reason: 'finding_present' });
  });

  test('the schema enforces one reason, one verdict, and a proof exactly for verified', async () => {
    const { capture } = await repair(CLICKABLE);
    const finding = capture.findings[0]!;
    expect(baselineFindingSchema.safeParse(finding).success).toBe(true);
    const { proof: _proof, ...unproven } = finding;
    expect(baselineFindingSchema.safeParse(unproven).success).toBe(false);
    expect(baselineFindingSchema.safeParse({ ...finding, reason: 'finding_persists' }).success).toBe(false);
    expect(baselineFindingSchema.safeParse({ ...unproven, verdict: 'contradicted', reason: 'behavior_unchanged' }).success).toBe(false);
    expect(capture.verdict).toBe('verified');
    expect(baselineCaptureSchema.safeParse({ ...capture, findings: [] }).success).toBe(false);
  });
});
