import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { formatText, inspect, parseArguments, run } from '../../packages/cli/src/index.js';
import { validSnapshotFixture } from '../../packages/protocol/src/fixtures.js';

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
  }, 20_000);

  test('reports each public shop defect through the CLI inspection path', async () => {
    const expected = [
      ['horizontal-overflow', 'HORIZONTAL_OVERFLOW'], ['ancestor-clip', 'CLIPPED_BY_ANCESTOR'], ['line-budget', 'TEXT_LINE_BUDGET_EXCEEDED'],
      ['hidden-checkout', 'EXPECTED_VISIBLE_BUT_HIDDEN'], ['blocked-checkout', 'POINTER_BLOCKED_AT_SAMPLES'], ['partial-checkout', 'POINTER_PARTIALLY_BLOCKED']
    ] as const;
    for (const [scenario, code] of expected) {
      const snapshot = await inspect(parseArguments(['inspect', `${url}/?scenario=${scenario}`, '--viewport', '390x844', '--format', 'json']));
      expect(snapshot.findings.some((finding) => finding.code === code)).toBe(true);
    }
  }, 30_000);
});
