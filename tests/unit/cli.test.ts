import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { formatText, inspect, parseArguments, parseReportArguments, parseCheckArguments, parseStudioArguments, run } from '../../packages/cli/src/index.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { envelopeOf, envelopeSchema, errorEnvelopeSchema, snapshotSchema, type ErrorCode } from '@anwc/protocol';
import { reportSchema } from '@anwc/report';

let server: ViteDevServer;
const url = 'http://127.0.0.1:4174';

beforeAll(async () => {
  server = await createServer({ root: join(process.cwd(), 'examples', 'shop'), configFile: join(process.cwd(), 'examples', 'shop', 'vite.config.ts'), server: { host: '127.0.0.1', port: 4174, strictPort: true } });
  await server.listen();
});

afterAll(async () => { await server.close(); });

describe('ANWC CLI', () => {
  test('parses the public option contract and bounds text output', () => {
    expect(parseArguments(['inspect', url, '--viewport', '390x844', '--format', 'json', '--fail-on', 'warning'])).toMatchObject({ viewport: { width: 390, height: 844 }, format: 'json', failOn: 'warning' });
    expect(() => parseArguments(['inspect', url, '--viewport', 'bad'])).toThrow('WIDTHxHEIGHT');
    expect(formatText(validSnapshotFixture, 1, 80)).toContain('truncated by --max-chars');
  });

  test('inspects an instrumented Vite page without screenshots', async () => {
    const linked = await inspect(parseArguments(['inspect', url, '--viewport', '390x844', '--format', 'json', '--fail-on', 'none']));
    expect(linked.page.viewport).toEqual({ width: 390, height: 844 });
    expect(linked.nodes.some((node) => node.source?.file === 'examples/shop/src/main.tsx')).toBe(true);
  });

  test('inspects an injected runtime-only page without screenshots', async () => {
    const runtimeOnly = await inspect(parseArguments(['inspect', 'data:text/html,<button>Runtime only</button>', '--runtime-only', '--format', 'json']));
    expect(runtimeOnly.nodes.some((node) => node.label === 'Runtime only' && node.source === null)).toBe(true);
  }, 20_000);

  test('returns defined error and finding statuses with JSON-only stdout', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = { stdout: (message: string) => stdout.push(message), stderr: (message: string) => stderr.push(message) };
    // --fail-on: findings are data (ok:true), the threshold only sets exit 1.
    const findingExit = await run(['inspect', 'data:text/html,<button data-anwc-expect="interactive" style="display:none">Hidden</button>', '--runtime-only', '--format', 'json', '--fail-on', 'error'], io);
    expect(findingExit).toBe(1);
    const findingEnvelope = envelopeOf(snapshotSchema).parse(JSON.parse(stdout.pop()!));
    expect(findingEnvelope).toMatchObject({ version: '0.1', ok: true, command: 'inspect', data: { schemaVersion: '0.1' } });
    expect(stderr).toEqual([]);

    const passingExit = await run(['inspect', 'data:text/html,<button data-anwc-expect="interactive" style="display:none">Hidden</button>', '--runtime-only', '--format', 'json', '--fail-on', 'none'], io);
    expect(passingExit).toBe(0);
    expect(envelopeSchema.parse(JSON.parse(stdout.pop()!))).toMatchObject({ ok: true, command: 'inspect' });

    const missingExit = await run(['inspect', 'data:text/html,<button>Missing runtime</button>', '--format', 'json'], io);
    expect(missingExit).toBe(1);
    expect(errorEnvelopeSchema.parse(JSON.parse(stdout.pop()!))).toMatchObject({ ok: false, command: 'inspect', error: { code: 'RUNTIME_MISSING', details: { kind: 'RUNTIME_MISSING' }, retry: 'safe', recovery: { strategy: 'instrument_target' } } });

    const exceptionExit = await run(['inspect', 'data:text/html,<script>window.__ANWC__={capture(){throw new Error("capture broke")}}</script>', '--format', 'json'], io);
    expect(exceptionExit).toBe(1);
    expect(errorEnvelopeSchema.parse(JSON.parse(stdout.pop()!))).toMatchObject({ error: { code: 'INTERNAL', message: expect.stringContaining('capture broke'), details: { kind: 'RUNTIME_CAPTURE_FAILED' } } });
  }, 20_000);

  test('reports each public shop defect through the CLI inspection path', async () => {
    const expected = [
      ['horizontal-overflow', 'HORIZONTAL_OVERFLOW'], ['ancestor-clip', 'CLIPPED_BY_ANCESTOR'], ['nested-clip', 'CLIPPED_BY_ANCESTOR'],
      ['line-budget', 'TEXT_LINE_BUDGET_EXCEEDED'], ['text-clipped', 'TEXT_CLIPPED'], ['hidden-checkout', 'EXPECTED_VISIBLE_BUT_HIDDEN'],
      ['opacity-checkout', 'EXPECTED_VISIBLE_BUT_HIDDEN'], ['blocked-checkout', 'POINTER_BLOCKED_AT_SAMPLES'], ['partial-checkout', 'POINTER_PARTIALLY_BLOCKED'], ['outside-viewport', 'OUTSIDE_VIEWPORT']
    ] as const;
    for (const [scenario, code] of expected) {
      const snapshot = await inspect(parseArguments(['inspect', `${url}/?scenario=${scenario}`, '--viewport', '390x844', '--format', 'json']));
      expect(snapshot.findings.some((finding) => finding.code === code)).toBe(true);
    }
  }, 30_000);

  test('rejects markdown URLs and displays recovery instructions in text and JSON formats', async () => {
    const textStdout: string[] = [];
    const textStderr: string[] = [];
    const textIo = { stdout: (m: string) => textStdout.push(m), stderr: (m: string) => textStderr.push(m) };

    const exit1 = await run(['inspect', '[Shop](http://127.0.0.1:4174/)', '--format', 'text'], textIo);
    expect(exit1).toBe(2);
    expect(textStderr.join('\n')).toContain('ANWC INVALID_USAGE: Invalid URL');
    expect(textStderr.join('\n')).toContain('Recovery: Strip Markdown formatting');

    const jsonStdout: string[] = [];
    const jsonStderr: string[] = [];
    const jsonIo = { stdout: (m: string) => jsonStdout.push(m), stderr: (m: string) => jsonStderr.push(m) };

    const exit2 = await run(['inspect', '<http://127.0.0.1:4174/>', '--format', 'json'], jsonIo);
    expect(exit2).toBe(2);
    const jsonReport = errorEnvelopeSchema.parse(JSON.parse(jsonStdout.join('')));
    expect(jsonReport.error.code).toBe('INVALID_USAGE');
    expect(jsonReport.error.details?.kind).toBe('MARKDOWN_URL');
    expect(jsonReport.error.recovery?.hint).toContain('Strip Markdown formatting');
    expect(jsonReport.error.retry).toBe('safe');
    expect(jsonStderr).toEqual([]);
  });

  test('provides actionable recovery guidance when runtime is missing in text and JSON modes', async () => {
    const textStdout: string[] = [];
    const textStderr: string[] = [];
    const textIo = { stdout: (m: string) => textStdout.push(m), stderr: (m: string) => textStderr.push(m) };

    const exit = await run(['inspect', 'data:text/html,<button>Plain button</button>', '--format', 'text'], textIo);
    expect(exit).toBe(1);
    const textOut = textStderr.join('\n');
    expect(textOut).toContain('ANWC RUNTIME_MISSING: ANWC runtime is not present on this page.');
    expect(textOut).toContain("Recovery: Ensure '@anwc/vite-plugin' is added to plugins in vite.config.ts");
    expect(textStdout).toEqual([]);

    const jsonStdout: string[] = [];
    const jsonStderr: string[] = [];
    const jsonIo = { stdout: (m: string) => jsonStdout.push(m), stderr: (m: string) => jsonStderr.push(m) };

    expect(await run(['inspect', 'data:text/html,<button>Plain button</button>', '--format', 'json'], jsonIo)).toBe(1);
    const jsonReport = errorEnvelopeSchema.parse(JSON.parse(jsonStdout.join('')));
    expect(jsonReport.error.recovery?.hint).toContain("Ensure '@anwc/vite-plugin' is added");
  }, 20_000);

  test('produces each error code that has a real producer, with exit 1 and a valid envelope', async () => {
    async function inspectJson(args: string[]): Promise<{ exit: number; envelope: ReturnType<typeof errorEnvelopeSchema.parse> }> {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exit = await run(['inspect', ...args, '--format', 'json'], { stdout: (m) => stdout.push(m), stderr: (m) => stderr.push(m) });
      expect(stderr).toEqual([]);
      expect(stdout).toHaveLength(1);
      return { exit, envelope: errorEnvelopeSchema.parse(JSON.parse(stdout[0]!)) };
    }
    const cases: Array<[ErrorCode, string, string[], { retryable: boolean; requiresFreshCapture: boolean }]> = [
      // Nothing listens on port 9; navigation is refused.
      ['TARGET_UNREACHABLE', 'NAVIGATION_FAILED', ['http://127.0.0.1:9/', '--timeout-ms', '3000'], { retryable: true, requiresFreshCapture: false }],
      ['NOT_SETTLED', 'READY_SELECTOR_TIMEOUT', ['data:text/html,<p>never ready</p>', '--runtime-only', '--ready-selector', '#never', '--timeout-ms', '300'], { retryable: true, requiresFreshCapture: true }],
      ['BUDGET_EXCEEDED', 'CAPTURE_TIMEOUT', ['data:text/html,<script>window.__ANWC__={capture(){return new Promise(()=>{})}}</script>', '--timeout-ms', '500'], { retryable: true, requiresFreshCapture: true }],
      // Injected collector refused by CSP (--runtime-only).
      ['CSP_BLOCKED', 'RUNTIME_SCRIPT_BLOCKED_BY_CSP', [`data:text/html,<meta http-equiv="Content-Security-Policy" content="script-src 'none'"><button>CSP page</button>`, '--runtime-only'], { retryable: false, requiresFreshCapture: false }],
      // Page's own runtime script refused by CSP: detected from the browser's CSP violation report.
      ['CSP_BLOCKED', 'RUNTIME_SCRIPT_BLOCKED_BY_CSP', [`data:text/html,<meta http-equiv="Content-Security-Policy" content="script-src 'none'"><script>window.__ANWC__={capture(){}}</script><button>CSP page</button>`], { retryable: false, requiresFreshCapture: false }],
      // The page navigates away mid-capture and the new document has no runtime (retry wait is capped at 5 s).
      ['CAPTURE_STALE', 'DOCUMENT_REPLACED_DURING_CAPTURE', [`data:text/html,<script>window.__ANWC__={capture(){location.href='about:blank';return new Promise(()=>{})}}</script>`, '--timeout-ms', '8000'], { retryable: true, requiresFreshCapture: true }]
    ];
    for (const [code, kind, args, recovery] of cases) {
      const { exit, envelope } = await inspectJson(args);
      expect(envelope.error.code, kind).toBe(code);
      expect(envelope.error.details?.kind, code).toBe(kind);
      expect(envelope.error.recovery, code).toMatchObject(recovery);
      // inspect is read-only, so re-running cannot duplicate an effect.
      expect(envelope.error.retry, code).toBe('safe');
      expect(envelope.command).toBe('inspect');
      expect(exit, code).toBe(1);
    }
  }, 60_000);

  test('prints a usage envelope with exit 2 for parse errors and unknown commands in JSON mode', async () => {
    for (const args of [['inspect', '--format', 'json'], ['inspect', url, '--viewport', 'bad', '--format', 'json'], ['bogus', '--format', 'json'], ['report', '--format', 'json'], ['diff', 'only-one.json', '--format', 'json'], ['check']]) {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exit = await run(args, { stdout: (m) => stdout.push(m), stderr: (m) => stderr.push(m) });
      expect(exit, args.join(' ')).toBe(2);
      expect(stderr, args.join(' ')).toEqual([]);
      const envelope = errorEnvelopeSchema.parse(JSON.parse(stdout.join('')));
      expect(envelope.error).toMatchObject({ code: 'INVALID_USAGE', retry: 'safe', recovery: { strategy: 'fix_input', retryable: false } });
      expect(envelope.command).toBe(args[0] === 'bogus' ? 'unknown' : args[0]);
    }
  });

  test('keeps bare payloads in --output files and accepts envelope-wrapped saved input', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-cli-envelope-'));
    try {
      const silent = { stdout: () => {}, stderr: () => {} };
      // inspect --format json --output writes the bare Snapshot; stdout stays empty on success.
      const snapPath = join(tmp, 'snap.json');
      const stdout: string[] = [];
      const exit = await run(['inspect', 'data:text/html,<button>Saved</button>', '--runtime-only', '--format', 'json', '--output', snapPath], { stdout: (m) => stdout.push(m), stderr: () => {} });
      expect(exit).toBe(0);
      expect(stdout).toEqual([]);
      const saved = JSON.parse(await readFile(snapPath, 'utf8'));
      expect(snapshotSchema.parse(saved).schemaVersion).toBe('0.1');
      expect(saved).not.toHaveProperty('ok');

      // stdout redirected to a file is an envelope; report and diff accept it.
      const wrappedPath = join(tmp, 'wrapped.json');
      await writeFile(wrappedPath, JSON.stringify({ version: '0.1', ok: true, command: 'inspect', data: validSnapshotFixture }), 'utf8');
      const reportOut: string[] = [];
      expect(await run(['report', wrappedPath, '--format', 'json'], { stdout: (m) => reportOut.push(m), stderr: () => {} })).toBe(0);
      const reportEnvelope = envelopeOf(reportSchema).parse(JSON.parse(reportOut.join('')));
      expect(reportEnvelope.ok).toBe(true);

      const reportFile = join(tmp, 'report.json');
      expect(await run(['report', wrappedPath, '--format', 'json', '--output', reportFile], silent)).toBe(0);
      expect(reportSchema.parse(JSON.parse(await readFile(reportFile, 'utf8'))).schemaVersion).toBe('0.1');

      const diffOut: string[] = [];
      const diffExit = await run(['diff', wrappedPath, snapPath, '--format', 'json'], { stdout: (m) => diffOut.push(m), stderr: () => {} });
      expect(diffExit).toBe(1); // not a verified repair: data, not an error
      expect(envelopeSchema.parse(JSON.parse(diffOut.join('')))).toMatchObject({ ok: true, command: 'diff', data: { schemaVersion: '0.1' } });

      // A saved error envelope is not evidence.
      const errorPath = join(tmp, 'error.json');
      await writeFile(errorPath, JSON.stringify({ version: '0.1', ok: false, command: 'inspect', error: { code: 'RUNTIME_MISSING', message: 'missing', retry: 'safe' } }), 'utf8');
      const errOut: string[] = [];
      expect(await run(['report', errorPath, '--format', 'json'], { stdout: (m) => errOut.push(m), stderr: () => {} })).toBe(2);
      expect(errorEnvelopeSchema.parse(JSON.parse(errOut.join(''))).error.details?.kind).toBe('INPUT_IS_ERROR_ENVELOPE');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test('formats understandable CLI text output with target names, measured evidence, blocker details, and drilldown', async () => {
    // Inspect blocked checkout scenario
    const blockedSnapshot = await inspect(parseArguments(['inspect', `${url}/?scenario=blocked-checkout`, '--viewport', '390x844', '--format', 'json']));
    const formatted = formatText(blockedSnapshot, 10, 10_000);

    expect(formatted).toContain('ANWC 0.1 | 390x844');
    expect(formatted).toContain('POINTER_BLOCKED_AT_SAMPLES');
    expect(formatted).toContain('<button>');
    expect(formatted).toContain('source: examples/shop/src/main.tsx');
    expect(formatted).toContain('evidence: tested 25 sample points, 25 blocked');
    expect(formatted).toContain('blocker: <div>');
    expect(formatted).toContain('Drilldown: re-run with --format json');

    // Inspect clean storefront (zero findings)
    const cleanSnapshot = await inspect(parseArguments(['inspect', `${url}/`, '--viewport', '1440x900', '--format', 'json']));
    const cleanFormatted = formatText(cleanSnapshot, 10, 10_000);
    expect(cleanFormatted).toContain('0 actionable findings for inspected rules');
    expect(cleanFormatted).toContain('paint visibility unknown');
  }, 30_000);

  test('parses report arguments and renders offline HTML, Markdown, text, and JSON reports', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-cli-report-'));
    try {
      const capturePath = join(tmp, 'capture.json');
      const htmlOutPath = join(tmp, 'report.html');
      const mdOutPath = join(tmp, 'report.md');

      await writeFile(capturePath, JSON.stringify(validSnapshotFixture), 'utf8');

      // Test argument parser
      expect(parseReportArguments(['report', capturePath, '--format', 'html', '--output', htmlOutPath, '--redact'])).toEqual({
        captureFile: capturePath,
        format: 'html',
        output: htmlOutPath,
        redact: true
      });
      expect(() => parseReportArguments(['report'])).toThrow('Usage: anwc report');
      expect(() => parseReportArguments(['report', capturePath, '--format', 'invalid'])).toThrow('Invalid --format');

      // 1. Render HTML report to file
      const htmlIo = { stdout: () => {}, stderr: () => {} };
      const htmlExit = await run(['report', capturePath, '--format', 'html', '--output', htmlOutPath], htmlIo);
      expect(htmlExit).toBe(0);
      const htmlContent = await readFile(htmlOutPath, 'utf8');
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('ANWC UI Repair Report');
      expect(htmlContent).toContain('POINTER_BLOCKED_AT_SAMPLES');

      // 2. Render Markdown report to file
      const mdIo = { stdout: () => {}, stderr: () => {} };
      const mdExit = await run(['report', capturePath, '--format', 'markdown', '--output', mdOutPath, '--redact'], mdIo);
      expect(mdExit).toBe(0);
      const mdContent = await readFile(mdOutPath, 'utf8');
      expect(mdContent).toContain('# ANWC UI Repair Report');
      expect(mdContent).toContain('[REDACTED EXPORT]');
      expect(mdContent).toContain('| Unacknowledged Errors | 1 |');

      // 3. Render Markdown report to stdout
      const stdoutBuf: string[] = [];
      const stdoutIo = { stdout: (m: string) => stdoutBuf.push(m), stderr: () => {} };
      const stdoutExit = await run(['report', capturePath, '--format', 'markdown'], stdoutIo);
      expect(stdoutExit).toBe(0);
      expect(stdoutBuf.join('')).toContain('## Summary');

      // 4. Render JSON report to stdout
      const jsonBuf: string[] = [];
      const jsonIo = { stdout: (m: string) => jsonBuf.push(m), stderr: () => {} };
      const jsonExit = await run(['report', capturePath, '--format', 'json'], jsonIo);
      expect(jsonExit).toBe(0);
      const reportEnvelope = envelopeOf(reportSchema).parse(JSON.parse(jsonBuf.join('')));
      expect(reportEnvelope).toMatchObject({ version: '0.1', ok: true, command: 'report' });
      const parsedReport = (reportEnvelope as { data: { schemaVersion: string; summary: { totalFindings: number } } }).data;
      expect(parsedReport.schemaVersion).toBe('0.1');
      expect(parsedReport.summary.totalFindings).toBe(1);

      // 5. Error on nonexistent file
      const errIo = { stdout: () => {}, stderr: (m: string) => stdoutBuf.push(m) };
      const missingExit = await run(['report', join(tmp, 'nonexistent.json')], errIo);
      expect(missingExit).toBe(2);

      // 6. Error on invalid JSON
      const invalidPath = join(tmp, 'invalid.json');
      await writeFile(invalidPath, '{ not valid json', 'utf8');
      const invalidExit = await run(['report', invalidPath], errIo);
      expect(invalidExit).toBe(2);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('parses check arguments and executes state reproduction suite', async () => {
    expect(parseCheckArguments(['check', 'anwc.checks.json', '--output', 'artifacts/ui'])).toEqual({
      manifestFile: 'anwc.checks.json',
      outputDir: 'artifacts/ui'
    });
    expect(() => parseCheckArguments(['check'])).toThrow('Usage: anwc check');

    const tmp = await mkdtemp(join(tmpdir(), 'anwc-check-cli-'));
    try {
      const manifestPath = join(tmp, 'checks.json');
      const outDir = join(tmp, 'out');
      const manifest = {
        schemaVersion: '0.1',
        baseUrl: url,
        scenarios: [
          {
            id: 'root-storefront',
            title: 'Root Storefront Initial & Scrolled Check',
            viewport: { width: 1440, height: 900 },
            checkpoints: [
              {
                name: 'initial-view',
                steps: [
                  { action: 'navigate', path: '/' },
                  { action: 'capture', name: 'initial-capture' }
                ],
                assertions: [
                  {
                    id: 'header-visible',
                    description: 'Main header is visible',
                    selector: 'h1',
                    expected: 'visible'
                  }
                ]
              },
              {
                name: 'scrolled-view',
                steps: [
                  { action: 'scroll', y: 300 },
                  { action: 'capture', name: 'scrolled-capture' }
                ],
                assertions: [
                  {
                    id: 'header-still-visible',
                    description: 'Header text matches shop title',
                    selector: 'h1',
                    expected: 'text-contains',
                    expectedValue: 'Useful objects'
                  }
                ]
              }
            ]
          }
        ]
      };
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const stdout: string[] = [];
      const stderr: string[] = [];
      const io = { stdout: (m: string) => stdout.push(m), stderr: (m: string) => stderr.push(m) };
      const exitCode = await run(['check', manifestPath, '--output', outDir], io);
      if (exitCode !== 0) {
        console.error('Check failed with stdout:', stdout.join(''), 'stderr:', stderr.join(''));
      }
      expect(exitCode).toBe(0);

      const checkEnvelope = envelopeSchema.parse(JSON.parse(stdout.join('')));
      expect(checkEnvelope).toMatchObject({ version: '0.1', ok: true, command: 'check' });
      const runResult = (checkEnvelope as { data: Record<string, any> }).data;
      expect(runResult.schemaVersion).toBe('0.1');
      expect(runResult.totalScenarios).toBe(1);
      expect(runResult.passedScenarios).toBe(1);
      expect(runResult.passedAll).toBe(true);

      const initialCapture = JSON.parse(await readFile(join(outDir, 'initial-capture.json'), 'utf8'));
      expect(initialCapture.schemaVersion).toBe('0.1');
      expect(initialCapture.nodes.length).toBeGreaterThan(0);

      const checkSummary = JSON.parse(await readFile(join(outDir, 'check-summary.json'), 'utf8'));
      expect(checkSummary.passedAll).toBe(true);
      expect(checkSummary.scenarios[0].checkpoints).toHaveLength(2);
      const [initialCheckpoint, scrolledCheckpoint] = runResult.scenarios[0].checkpoints;
      expect(initialCheckpoint.stateDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(initialCheckpoint.captureState).toMatchObject({ location: '/', settled: true, complete: true });
      expect(scrolledCheckpoint.captureState.scroll.y).toBeGreaterThan(0);
      expect(scrolledCheckpoint.stateDigest).not.toBe(initialCheckpoint.stateDigest);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  test('rejects unsafe check manifests with a usage error before writing anything', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'anwc-check-invalid-'));
    const capture = (name: string) => ({ name: 'c', steps: [{ action: 'navigate', path: '/' }, { action: 'capture', name }] });
    const manifestWith = (checkpoints: unknown[], extraScenario?: unknown) => ({
      schemaVersion: '0.1',
      baseUrl: url,
      scenarios: [{ id: 's', title: 't', checkpoints }, ...(extraScenario ? [extraScenario] : [])]
    });
    const cases: Array<[string, unknown, RegExp]> = [
      ['path escape', manifestWith([capture('../escape')]), /capture name '\.\.\/escape'/],
      ['nested path', manifestWith([capture('dir/name')]), /one safe file-name segment/],
      ['windows separator', manifestWith([capture('dir\\name')]), /one safe file-name segment/],
      ['reserved device', manifestWith([capture('nul')]), /reserved device name/],
      ['summary collision', manifestWith([capture('check-summary')]), /reserved for the run summary/],
      ['duplicate across scenarios', manifestWith([capture('shot')], { id: 's2', title: 't2', checkpoints: [capture('Shot')] }), /duplicates a capture in s\/c/],
      ['text-contains without value', manifestWith([{ name: 'c', steps: [{ action: 'navigate', path: '/' }], assertions: [{ id: 'a', description: 'd', selector: 'h1', expected: 'text-contains' }] }]), /'text-contains' requires a non-empty expectedValue/],
      ['text-contains with empty value', manifestWith([{ name: 'c', steps: [{ action: 'navigate', path: '/' }], assertions: [{ id: 'a', description: 'd', selector: 'h1', expected: 'text-contains', expectedValue: '' }] }]), /'text-contains' requires a non-empty expectedValue/],
      ['attribute-equals without value', manifestWith([{ name: 'c', steps: [{ action: 'navigate', path: '/' }], assertions: [{ id: 'a', description: 'd', selector: 'h1', expected: 'attribute-equals', attributeName: 'id' }] }]), /'attribute-equals' requires expectedValue/],
      ['attribute-equals without name', manifestWith([{ name: 'c', steps: [{ action: 'navigate', path: '/' }], assertions: [{ id: 'a', description: 'd', selector: 'h1', expected: 'attribute-equals', expectedValue: 'x' }] }]), /'attribute-equals' requires attributeName/]
    ];
    try {
      for (const [label, manifest, message] of cases) {
        const manifestPath = join(tmp, 'checks.json');
        const outDir = join(tmp, 'out');
        await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
        const stdout: string[] = [];
        const stderr: string[] = [];
        const exitCode = await run(['check', manifestPath, '--output', outDir], { stdout: (m) => stdout.push(m), stderr: (m) => stderr.push(m) });
        expect(exitCode, label).toBe(2);
        expect(stdout.join('') + stderr.join(''), label).toMatch(message);
        expect((await readdir(tmp)).sort(), label).toEqual(['checks.json']);
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('parses studio command arguments correctly', () => {
    const options = parseStudioArguments(['studio', 'http://127.0.0.1:5173', '--port', '4500', '--capture', 'test.json', '--no-open']);
    expect(options).toEqual({
      url: 'http://127.0.0.1:5173',
      port: 4500,
      capture: 'test.json',
      open: false
    });

    // Default options
    expect(parseStudioArguments(['studio'])).toEqual({
      url: undefined,
      port: undefined,
      capture: undefined,
      open: true
    });

    // Only URL
    expect(parseStudioArguments(['studio', 'http://127.0.0.1:3000'])).toEqual({
      url: 'http://127.0.0.1:3000',
      port: undefined,
      capture: undefined,
      open: true
    });

    // Error handling
    expect(() => parseStudioArguments(['not-studio'])).toThrow('Usage: anwc studio');
    expect(() => parseStudioArguments(['studio', '--port'])).toThrow('--port must be a positive integer.');
    expect(() => parseStudioArguments(['studio', '--port', 'invalid'])).toThrow('--port must be a positive integer.');
    expect(() => parseStudioArguments(['studio', '--capture'])).toThrow('--capture requires a file path.');
    expect(() => parseStudioArguments(['studio', '--unknown-flag'])).toThrow("Unknown studio argument '--unknown-flag'.");
    expect(() => parseStudioArguments(['studio', '[markdown](http://127.0.0.1:5173)'])).toThrow('Markdown link syntax is not allowed');
  });

  test('runs studio command in test mode and cleanly shuts down', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = { stdout: (m: string) => stdout.push(m), stderr: (m: string) => stderr.push(m) };

    const exitCode = await run(['studio', 'http://127.0.0.1:5173', '--port', '0', '--no-open'], io);
    expect(exitCode).toBe(0);
    const output = stdout.join('');
    expect(output).toContain('ANWC Studio running at http://127.0.0.1:');
    expect(output).toContain('Target URL: http://127.0.0.1:5173');
    expect(stderr).toEqual([]);
  });

  test('reports errors when studio arguments are invalid in run()', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = { stdout: (m: string) => stdout.push(m), stderr: (m: string) => stderr.push(m) };

    const exitCode = await run(['studio', '--port', 'not-a-number'], io);
    expect(exitCode).toBe(2);
    expect(stderr.join('')).toContain('ANWC INVALID_USAGE: --port must be a positive integer.');
  });
});

