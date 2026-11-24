import { expect, test } from '@playwright/test';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { loadBaseline, runCheckSuite, stateManifestSchema, type StateManifest } from '../../packages/cli/src/index.js';

// A disposable copy of the shop, the committed manifest, a real source edit, the real runner.
const root = resolve(import.meta.dirname, '../..');
const FIX = `
.blocked.obstacle-fixture { height: auto; }
.blocked.obstacle-fixture > button { min-height: 4.5rem; }
.blocked .cookie-obstacle { position: static; margin-top: .5rem; min-height: 2.5rem; }
`;

test.describe('check --baseline on a repaired copy of the shop', () => {
  let dir: string;
  let server: ViteDevServer;
  let origin: string;
  let manifest: StateManifest;

  test.beforeEach(async () => {
    mkdirSync(join(root, 'artifacts'), { recursive: true });
    dir = mkdtempSync(join(root, 'artifacts', 'check-baseline-'));
    cpSync(join(root, 'examples/shop'), join(dir, 'shop'), { recursive: true, filter: (source) => !/[\\/](node_modules|dist|tsconfig.json)$/.test(source) });
    server = await createServer({ root: join(dir, 'shop'), configFile: join(dir, 'shop/vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
    await server.listen();
    origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
    manifest = stateManifestSchema.parse({ ...JSON.parse(readFileSync(join(root, 'examples/shop/anwc/checkout.states.json'), 'utf8')), baseUrl: origin });
  });
  test.afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  const served = (path: string, ready: (text: string) => boolean) => expect.poll(async () => ready(await (await fetch(`${origin}${path}`)).text()), { timeout: 10_000 }).toBe(true);

  test('the documented CSS fix is verified', async ({ browser }) => {
    test.setTimeout(60_000);
    const before = await runCheckSuite({ manifest, manifestRaw: JSON.stringify(manifest), browser, outputDir: join(dir, 'before') });
    expect(before.passedAll).toBe(false);
    expect(before.scenarios[0].checkpoints[0].steps.at(-1)).toMatchObject({ action: 'click', status: 'timed-out' });
    expect(before.scenarios[0].checkpoints[0].findingVerdicts).toMatchObject([{ code: 'POINTER_BLOCKED_AT_SAMPLES', targetKey: 'key:blocked-checkout' }]);

    appendFileSync(join(dir, 'shop/src/styles.css'), FIX);
    await served('/src/styles.css?direct', (text) => text.includes('.blocked.obstacle-fixture > button'));
    const after = await runCheckSuite({ manifest, manifestRaw: JSON.stringify(manifest), browser, outputDir: join(dir, 'after'), baseline: await loadBaseline(join(dir, 'before'), manifest) });

    expect(after.baseline).toMatchObject({ valid: true, repairVerified: true, findingVerdicts: { verified: 1, unverified: 0, contradicted: 0 } });
    expect(after.baseline!.captures[0].findings).toMatchObject([{
      code: 'POINTER_BLOCKED_AT_SAMPLES', targetKey: 'key:blocked-checkout', verdict: 'verified', reason: 'finding_absent_target_retained',
      proof: { step: 3, action: 'click', assertions: ['checkout-confirmed'], baselineStep: 'timed-out' }
    }]);
    // Nothing was written into the baseline, so it still loads.
    expect((await loadBaseline(join(dir, 'before'), manifest)).problem).toBeNull();
  });

  test('deleting the button is contradicted', async ({ browser }) => {
    test.setTimeout(60_000);
    await runCheckSuite({ manifest, manifestRaw: JSON.stringify(manifest), browser, outputDir: join(dir, 'before') });
    const file = join(dir, 'shop/src/main.tsx');
    const source = readFileSync(file, 'utf8');
    const deleted = source.replace(/<button data-anwc-key=\{`\$\{kind\}-checkout`\}.*?Checkout now<\/button>/, '');
    expect(deleted).not.toBe(source);
    writeFileSync(file, deleted);
    await served('/src/main.tsx', (text) => !text.includes('Checkout now'));
    const after = await runCheckSuite({ manifest, manifestRaw: JSON.stringify(manifest), browser, outputDir: join(dir, 'after'), baseline: await loadBaseline(join(dir, 'before'), manifest) });
    expect(after.baseline).toMatchObject({ valid: true, repairVerified: false, findingVerdicts: { verified: 0, unverified: 0, contradicted: 1 } });
    expect(after.baseline!.captures[0].findings).toMatchObject([{ verdict: 'contradicted', reason: 'target_unmounted' }]);
  });
});
