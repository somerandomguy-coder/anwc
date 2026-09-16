import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { formatText, inspect, parseArguments, run } from '../../packages/cli/src/index.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

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
    const findingExit = await run(['inspect', 'data:text/html,<button data-anwc-expect="interactive" style="display:none">Hidden</button>', '--runtime-only', '--format', 'json', '--fail-on', 'error'], io);
    expect(findingExit).toBe(1);
    expect(JSON.parse(stdout.pop()!)).toMatchObject({ schemaVersion: '0.1' });
    expect(stderr).toEqual([]);

    const missingExit = await run(['inspect', 'data:text/html,<button>Missing runtime</button>', '--format', 'json'], io);
    expect(missingExit).toBe(2);
    expect(JSON.parse(stdout.pop()!)).toMatchObject({ error: { code: 'RUNTIME_MISSING' } });

    const exceptionExit = await run(['inspect', 'data:text/html,<script>window.__ANWC__={capture(){throw new Error("capture broke")}}</script>', '--format', 'json'], io);
    expect(exceptionExit).toBe(2);
    expect(JSON.parse(stdout.pop()!)).toMatchObject({ error: { code: 'INTERNAL', message: expect.stringContaining('capture broke') } });
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
    const jsonReport = JSON.parse(jsonStdout.join(''));
    expect(jsonReport.error.code).toBe('INVALID_USAGE');
    expect(jsonReport.error.details.recovery).toContain('Strip Markdown formatting');
  });

  test('provides actionable recovery guidance when runtime is missing in text and JSON modes', async () => {
    const textStdout: string[] = [];
    const textStderr: string[] = [];
    const textIo = { stdout: (m: string) => textStdout.push(m), stderr: (m: string) => textStderr.push(m) };

    const exit = await run(['inspect', 'data:text/html,<button>Plain button</button>', '--format', 'text'], textIo);
    expect(exit).toBe(2);
    const textOut = textStderr.join('\n');
    expect(textOut).toContain('ANWC RUNTIME_MISSING: ANWC runtime is not present on this page.');
    expect(textOut).toContain("Recovery: Ensure '@anwc/vite-plugin' is added to plugins in vite.config.ts");

    const jsonStdout: string[] = [];
    const jsonStderr: string[] = [];
    const jsonIo = { stdout: (m: string) => jsonStdout.push(m), stderr: (m: string) => jsonStderr.push(m) };

    await run(['inspect', 'data:text/html,<button>Plain button</button>', '--format', 'json'], jsonIo);
    const jsonReport = JSON.parse(jsonStdout.join(''));
    expect(jsonReport.error.details.recovery).toContain("Ensure '@anwc/vite-plugin' is added");
  }, 20_000);

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
    expect(formatted).toContain('Drilldown: re-run with --format json or --output report.json');

    // Inspect clean storefront (zero findings)
    const cleanSnapshot = await inspect(parseArguments(['inspect', `${url}/`, '--viewport', '1440x900', '--format', 'json']));
    const cleanFormatted = formatText(cleanSnapshot, 10, 10_000);
    expect(cleanFormatted).toContain('0 actionable findings for inspected rules');
    expect(cleanFormatted).toContain('paint visibility unknown');
  }, 30_000);
});
