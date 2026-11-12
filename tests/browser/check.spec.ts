import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCheckSuite, type StateManifest } from '../../packages/cli/src/index.js';

const baseUrl = 'http://127.0.0.1:4173';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

/** Fault injection on the real runtime: wrap __ANWC__.capture and degrade its result. */
function degradedRuntime(kind: 'unsettled' | 'incomplete'): () => Promise<string> {
  const patch = kind === 'unsettled'
    ? "c.readiness = { ...c.readiness, settled: false, reasons: ['test: forced unsettled'] };"
    : "c.coverage = { ...c.coverage, complete: false, reasons: ['test: forced incomplete'] };";
  return async () => `(() => {
    const real = window.__ANWC__;
    if (!real || real.__degraded) return;
    window.__ANWC__ = { ...real, __degraded: true, capture: async (o) => { const c = await real.capture(o); ${patch} return c; } };
  })();`;
}

test.describe('Q06 State Reproduction Runner', () => {
  let tmp: string;

  test.beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'anwc-q06-repro-'));
  });

  test.afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test('reproduces initial, modal, scrolled and cart states twice with storage isolation and behavior assertions', async ({ browser }) => {
    test.setTimeout(90_000);
    const manifest: StateManifest = {
      schemaVersion: '0.1',
      baseUrl,
      scenarios: [
        {
          id: 'store-state-flows',
          title: 'Storefront Modal, Scrolled, and Cart States',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            {
              name: 'initial-state',
              description: 'Initial home page load',
              steps: [
                { action: 'navigate', path: '/' },
                { action: 'capture', name: '01-initial' }
              ],
              assertions: [
                { id: 'h1-visible', description: 'Home heading is visible', selector: 'h1', expected: 'visible' },
                { id: 'modal-initially-hidden', description: 'Confirmation modal is not open', selector: '.modal-backdrop', expected: 'hidden' },
                { id: 'cart-starts-empty', description: 'Cart starts empty', selector: 'aside.cart strong', expected: 'text-contains', expectedValue: '0 items' }
              ]
            },
            {
              name: 'modal-opened-state',
              description: 'Click details button to open cart modal',
              steps: [
                { action: 'click', selector: 'nav.site-nav button:has-text("Details")' },
                { action: 'wait-for-selector', selector: 'section.product-modal', state: 'visible' },
                { action: 'capture', name: '02-modal-open' }
              ],
              assertions: [
                { id: 'modal-now-visible', description: 'Product modal dialog is visible', selector: 'section.product-modal', expected: 'visible' },
                { id: 'modal-title-text', description: 'Modal title confirms thoughtful cart', selector: 'section.product-modal h2', expected: 'text-contains', expectedValue: 'thoughtful cart' },
                { id: 'modal-label', description: 'Modal is labelled as cart details', selector: 'section.product-modal', expected: 'attribute-equals', attributeName: 'aria-label', expectedValue: 'Cart details' }
              ]
            },
            {
              name: 'modal-closed-state',
              description: 'Close details modal',
              steps: [
                { action: 'click', selector: 'button.close' },
                { action: 'wait-for-selector', selector: 'section.product-modal', state: 'hidden' },
                { action: 'capture', name: '03-modal-closed' }
              ],
              assertions: [
                { id: 'modal-backdrop-hidden', description: 'Modal backdrop is closed', selector: '.modal-backdrop', expected: 'hidden' }
              ]
            },
            {
              name: 'scrolled-sticky-nav-state',
              description: 'Scroll down and verify navigation persists',
              steps: [
                { action: 'scroll', y: 500 },
                { action: 'capture', name: '04-scrolled' }
              ],
              assertions: [
                { id: 'nav-persists', description: 'Nav remains visible after scroll', selector: 'nav.site-nav', expected: 'visible' }
              ]
            },
            {
              name: 'cart-persisted-in-session',
              description: 'Add an item, reload, and see it persisted in this context\'s sessionStorage',
              steps: [
                { action: 'click', selector: 'article.product-card:nth-of-type(1) button' },
                { action: 'navigate', path: '/' },
                { action: 'wait-for-selector', selector: 'aside.cart strong' },
                { action: 'capture', name: '05-cart-one-item' }
              ],
              assertions: [
                { id: 'cart-has-one-item', description: 'Cart shows one item after reload', selector: 'aside.cart strong', expected: 'text-contains', expectedValue: '1 item' }
              ]
            }
          ]
        },
        {
          id: 'independent-scenario-storage-isolation',
          title: 'Second Independent Scenario Verifies Storage Isolation',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            {
              name: 'verify-empty-cart-state',
              steps: [
                { action: 'navigate', path: '/' },
                { action: 'capture', name: '06-clean-cart' }
              ],
              assertions: [
                { id: 'cart-is-empty-in-fresh-context', description: 'Cart count is 0 items in a fresh context', selector: 'aside.cart strong', expected: 'text-contains', expectedValue: '0 items' }
              ]
            }
          ]
        }
      ]
    };

    const outDir = join(tmp, 'captures');
    const rawManifest = JSON.stringify(manifest, null, 2);

    const run1 = await runCheckSuite({ manifest, manifestRaw: rawManifest, outputDir: outDir, browser });
    expect(run1.scenarios.map((s) => s.error ?? null)).toEqual([null, null]);
    expect(run1.passedAll).toBe(true);
    expect(run1.totalScenarios).toBe(2);
    expect(run1.passedScenarios).toBe(2);

    const run2 = await runCheckSuite({ manifest, manifestRaw: rawManifest, browser });
    expect(run2.passedAll).toBe(true);

    // Reproducibility: compare reproducible state, not raw capture bytes (which carry session ids and timestamps).
    const checkpoints1 = run1.scenarios.flatMap((s) => s.checkpoints);
    const checkpoints2 = run2.scenarios.flatMap((s) => s.checkpoints);
    expect(checkpoints1).toHaveLength(6);
    expect(checkpoints2.map((c) => c.name)).toEqual(checkpoints1.map((c) => c.name));
    for (const [index, first] of checkpoints1.entries()) {
      const second = checkpoints2[index];
      expect(first.stateDigest, first.name).toMatch(/^[0-9a-f]{64}$/);
      expect(second.captureState, first.name).toEqual(first.captureState);
      expect(second.stateDigest, first.name).toBe(first.stateDigest);
      expect(second.finalScroll, first.name).toEqual(first.finalScroll);
      expect(second.assertions.map((a) => [a.id, a.passed, a.actual]), first.name).toEqual(first.assertions.map((a) => [a.id, a.passed, a.actual]));
      // Raw artifacts genuinely differ between runs (sessionId/captureId/capturedAt).
      expect(second.captureHash).not.toBe(first.captureHash);
      expect(second.capture?.sessionId).not.toBe(first.capture?.sessionId);
    }

    const states = checkpoints1.map((c) => c.captureState!);
    expect(states.every((s) => s.settled && s.complete)).toBe(true);
    expect(states[0].scroll.y).toBe(0);
    expect(states[3].scroll.y).toBeGreaterThan(0);
    expect(states[0].stableKeys.length).toBeGreaterThan(0);
    // Equal UI states share a digest; distinct UI states do not.
    const [initial, modalOpen, modalClosed, scrolled, oneItem, freshContext] = checkpoints1.map((c) => c.stateDigest);
    expect(modalClosed).toBe(initial);
    expect(freshContext).toBe(initial);
    expect(new Set([initial, modalOpen, scrolled, oneItem]).size).toBe(4);
    expect(states[4].nodeStates.some((entry) => entry.includes('label="1 item"'))).toBe(true);
    expect(states[5].nodeStates.some((entry) => entry.includes('label="0 items"'))).toBe(true);
    // Storage isolation: the cart written in scenario 1 does not leak into scenario 2's fresh context.
    expect(checkpoints1[4].assertions[0]).toMatchObject({ passed: true, actual: '1 item' });
    expect(checkpoints1[5].assertions[0]).toMatchObject({ passed: true, actual: '0 items' });

    // Genuine artifact hashes: captureHash is the sha256 of the bytes written to disk.
    for (const [index, name] of ['01-initial', '02-modal-open', '03-modal-closed', '04-scrolled', '05-cart-one-item', '06-clean-cart'].entries()) {
      const bytes = await readFile(join(outDir, `${name}.json`), 'utf8');
      expect(createHash('sha256').update(bytes, 'utf8').digest('hex'), name).toBe(checkpoints1[index].captureHash);
    }
    const initialCap = JSON.parse(await readFile(join(outDir, '01-initial.json'), 'utf8'));
    expect(initialCap.schemaVersion).toBe('0.1');
    expect(initialCap.nodes.length).toBeGreaterThan(0);

    const checkSummary = JSON.parse(await readFile(join(outDir, 'check-summary.json'), 'utf8'));
    expect(checkSummary.manifestHash).toBe(run1.manifestHash);
  });

  test('fails promptly on ambiguous click and ambiguous assertion targets', async ({ browser }) => {
    const manifest: StateManifest = {
      schemaVersion: '0.1',
      baseUrl,
      scenarios: [
        {
          id: 'ambiguous-target-failure',
          title: 'Ambiguous Selector Fails Promptly',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            { name: 'ambiguous-click', steps: [{ action: 'navigate', path: '/' }, { action: 'click', selector: 'button' }] }
          ]
        },
        {
          id: 'ambiguous-assertion-failure',
          title: 'Ambiguous Assertion Selector Fails',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            {
              name: 'ambiguous-assertion',
              steps: [{ action: 'navigate', path: '/' }],
              assertions: [{ id: 'any-button-visible', description: 'Ambiguous selector', selector: 'button', expected: 'visible' }]
            }
          ]
        }
      ]
    };

    const started = performance.now();
    const runResult = await runCheckSuite({ manifest, manifestRaw: JSON.stringify(manifest), browser });
    expect(performance.now() - started).toBeLessThan(15_000);

    expect(runResult.passedAll).toBe(false);
    expect(runResult.failedScenarios).toBe(2);
    const click = runResult.scenarios[0].checkpoints[0];
    expect(click.passed).toBe(false);
    expect(click.error).toContain('Target is ambiguous');
    expect(click.steps[1].status).toBe('failed');
    const assertion = runResult.scenarios[1].checkpoints[0];
    expect(assertion.passed).toBe(false);
    expect(assertion.assertions[0].passed).toBe(false);
    expect(assertion.assertions[0].error).toMatch(/strict mode violation/i);
  });

  test('fails promptly on missing selector timeout', async ({ browser }) => {
    const manifest: StateManifest = {
      schemaVersion: '0.1',
      baseUrl,
      scenarios: [
        {
          id: 'missing-selector-failure',
          title: 'Missing Selector Times Out Bounded',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            { name: 'missing-wait', steps: [{ action: 'navigate', path: '/' }, { action: 'wait-for-selector', selector: '#nonexistent-element-id', timeoutMs: 300 }] }
          ]
        }
      ]
    };

    // Warm the page once so the elapsed bound measures the runner, not a cold dev-server transform.
    await runCheckSuite({ manifest: { ...manifest, scenarios: [{ ...manifest.scenarios[0], checkpoints: [{ name: 'warm', steps: [{ action: 'navigate', path: '/' }] }] }] }, manifestRaw: '{}', browser });

    const started = performance.now();
    const runResult = await runCheckSuite({ manifest, manifestRaw: JSON.stringify(manifest), browser });
    const elapsed = performance.now() - started;

    expect(runResult.passedAll).toBe(false);
    expect(elapsed).toBeLessThan(3_000);
    const cp = runResult.scenarios[0].checkpoints[0];
    expect(cp.passed).toBe(false);
    expect(cp.steps[1].status).toBe('timed-out');
  });

  test('enforces a hard scenario deadline across steps', async ({ browser }) => {
    const manifest: StateManifest = {
      schemaVersion: '0.1',
      baseUrl,
      scenarios: [
        {
          id: 'deadline',
          title: 'Scenario deadline cuts a long wait',
          viewport: { width: 1440, height: 900 },
          checkpoints: [
            { name: 'load', steps: [{ action: 'navigate', path: '/' }] },
            // Each wait is individually allowed 10s; the scenario deadline must stop the run first.
            { name: 'slow-1', steps: [{ action: 'wait-for-selector', selector: '#never-1', timeoutMs: 10_000 }] },
            { name: 'slow-2', steps: [{ action: 'wait-for-selector', selector: '#never-2', timeoutMs: 10_000 }] }
          ]
        }
      ]
    };

    const started = performance.now();
    const runResult = await runCheckSuite({ manifest, manifestRaw: JSON.stringify(manifest), browser, scenarioTimeoutMs: 1_500 });
    const elapsed = performance.now() - started;

    expect(runResult.passedAll).toBe(false);
    expect(elapsed).toBeLessThan(5_000);
    const scenario = runResult.scenarios[0];
    expect(scenario.durationMs).toBeLessThan(3_000);
    expect(scenario.error).toMatch(/deadline/i);
    const failed = scenario.checkpoints.find((c) => !c.passed)!;
    expect(failed.steps.at(-1)?.status).toBe('timed-out');
  });

  for (const kind of ['unsettled', 'incomplete'] as const) {
    test(`fails the checkpoint for a ${kind} capture and keeps the evidence`, async ({ browser }) => {
      const outDir = join(tmp, `partial-${kind}`);
      const manifest: StateManifest = {
        schemaVersion: '0.1',
        baseUrl,
        scenarios: [
          {
            id: `partial-${kind}`,
            title: `A ${kind} capture fails its checkpoint`,
            viewport: { width: 1440, height: 900 },
            checkpoints: [
              {
                name: 'partial',
                steps: [{ action: 'navigate', path: '/' }, { action: 'capture', name: 'partial', runtimeOnly: true }],
                assertions: [{ id: 'h1-visible', description: 'Would pass on its own', selector: 'h1', expected: 'visible' }]
              }
            ]
          }
        ]
      };

      const runResult = await runCheckSuite({ manifest, manifestRaw: JSON.stringify(manifest), outputDir: outDir, browser, runtimeScriptProvider: degradedRuntime(kind) });

      expect(runResult.passedAll).toBe(false);
      const cp = runResult.scenarios[0].checkpoints[0];
      expect(cp.passed).toBe(false);
      expect(cp.steps[1].status).toBe('failed');
      expect(cp.error).toContain(kind === 'unsettled' ? 'not settled' : 'incomplete coverage');
      // Assertions do not run once a step failed, so they cannot mask the partial capture.
      expect(cp.assertions).toEqual([]);
      expect(cp.captureState?.[kind === 'unsettled' ? 'settled' : 'complete']).toBe(false);
      const written = JSON.parse(await readFile(join(outDir, 'partial.json'), 'utf8'));
      expect(kind === 'unsettled' ? written.readiness.settled : written.coverage.complete).toBe(false);
    });
  }

  test('rejects unsafe and duplicate capture names before writing anything', async ({ browser }) => {
    const outDir = join(tmp, 'out');
    const unsafeNames = ['../escape', 'nested/name', 'nested\\name', 'C:evil', '.hidden', 'CON', 'check-summary', 'trailing.'];
    for (const name of unsafeNames) {
      const manifest = {
        schemaVersion: '0.1',
        baseUrl,
        scenarios: [{ id: 's', title: 't', viewport: { width: 800, height: 600 }, checkpoints: [{ name: 'c', steps: [{ action: 'navigate', path: '/' }, { action: 'capture', name }], assertions: [] }] }]
      } as StateManifest;
      await expect(runCheckSuite({ manifest, manifestRaw: '{}', outputDir: outDir, browser }), name).rejects.toThrow(/Invalid check manifest/);
    }

    const duplicate = {
      schemaVersion: '0.1',
      baseUrl,
      scenarios: [
        { id: 'a', title: 'a', viewport: { width: 800, height: 600 }, checkpoints: [{ name: 'c', steps: [{ action: 'navigate', path: '/' }, { action: 'capture', name: 'same' }], assertions: [] }] },
        { id: 'b', title: 'b', viewport: { width: 800, height: 600 }, checkpoints: [{ name: 'c', steps: [{ action: 'navigate', path: '/' }, { action: 'capture', name: 'SAME' }], assertions: [] }] }
      ]
    } as StateManifest;
    await expect(runCheckSuite({ manifest: duplicate, manifestRaw: '{}', outputDir: outDir, browser })).rejects.toThrow(/duplicates a capture/);

    expect(await exists(outDir)).toBe(false);
    expect((await readdir(tmp)).sort()).toEqual([]);
  });
});
