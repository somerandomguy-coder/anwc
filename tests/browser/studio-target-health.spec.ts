import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { startStudioServer, type StudioServerHandle } from '../../packages/cli/src/studio.js';

// P10: the studio checks the target before loading the live iframe.
//
// Preset URLs are fixed to the documented example ports (shop 4175, pricing 4176,
// dashboard 4177). Whether 4175 is free depends on the machine, so the studio's
// target probe is given a fetch that sends requests for the shop origin to a port
// this test controls. Every other origin is fetched unchanged. The dashboard on
// 4177 is one of this config's webServers, so it is always running during the suite.

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const studioIndex = fileURLToPath(new URL('../../packages/cli/dist/studio/index.html', import.meta.url));
const SHOP_ORIGIN = 'http://127.0.0.1:4175';
const SHOP_START_COMMAND = 'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort';
const DASHBOARD_ORIGIN = 'http://127.0.0.1:4177';

/** A loopback port that nothing listens on: bind an ephemeral port, then release it. */
async function closedPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test.describe('P10 studio target health', () => {
  test.describe.configure({ mode: 'serial' });

  let studio: StudioServerHandle;
  let shopStandInPort: number;
  let shopStandIn: Server | undefined;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!existsSync(studioIndex)) {
      execFileSync('npx', ['vite', 'build', '--config', 'packages/studio/vite.config.ts', 'packages/studio'], {
        cwd: repoRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });
    }
    expect(existsSync(studioIndex), 'studio assets must be built into packages/cli/dist/studio').toBe(true);

    shopStandInPort = await closedPort();
    const fetchFn: typeof fetch = (input, init) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const target = raw.startsWith(SHOP_ORIGIN) ? `http://127.0.0.1:${shopStandInPort}${raw.slice(SHOP_ORIGIN.length)}` : raw;
      return fetch(target, init);
    };
    studio = await startStudioServer({ port: 0, openBrowser: false, fetchFn });
  });

  test.afterAll(async () => {
    if (shopStandIn) await new Promise<void>((resolve) => shopStandIn!.close(() => resolve()));
    await studio?.close();
  });

  test('a preset whose app is stopped shows the start command instead of the iframe, and Retry re-checks', async ({ page }) => {
    // Sanity: the probe endpoint itself reports the stopped shop as refused.
    const status = await (await fetch(`${studio.url}/api/target-status?url=${encodeURIComponent(`${SHOP_ORIGIN}/`)}`)).json();
    expect(status).toMatchObject({ ok: true, reachable: false, reason: 'connection_refused' });

    await page.goto(studio.url);
    await page.getByTestId('preset-picker').selectOption('shop-blocked-checkout');

    const pane = page.getByTestId('ground-truth-pane');
    const panel = pane.getByTestId('target-unreachable');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(`Nothing is answering at ${SHOP_ORIGIN}`);
    await expect(panel.getByTestId('target-start-command')).toHaveText(SHOP_START_COMMAND);
    await expect(pane.locator('iframe')).toHaveCount(0);
    await expect(page.getByTestId('data-source-badge')).toHaveText('Sample data');

    // Start something on the shop's stand-in port; Retry must now load the iframe.
    shopStandIn = createHttpServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>stand-in</title>');
    });
    await new Promise<void>((resolve) => shopStandIn!.listen(shopStandInPort, '127.0.0.1', resolve));
    await panel.getByRole('button', { name: 'Retry' }).click();
    await expect(pane.getByTestId('target-unreachable')).toHaveCount(0);
    await expect(pane.locator('iframe[title="Ground Truth Preview"]')).toHaveAttribute('src', new RegExp(`^${SHOP_ORIGIN}/`));
  });

  test('a preset whose app is running shows the live iframe and the sample-data badge', async ({ page }) => {
    const status = await (await fetch(`${studio.url}/api/target-status?url=${encodeURIComponent(`${DASHBOARD_ORIGIN}/`)}`)).json();
    expect(status, 'the dashboard webServer on 4177 must be running').toMatchObject({ ok: true, reachable: true });

    await page.goto(studio.url);
    await page.getByTestId('preset-picker').selectOption('dashboard-outside-viewport');

    const pane = page.getByTestId('ground-truth-pane');
    const iframe = pane.locator('iframe[title="Ground Truth Preview"]');
    await expect(iframe).toHaveAttribute('src', new RegExp(`^${DASHBOARD_ORIGIN}/`));
    await expect(pane.getByTestId('target-unreachable')).toHaveCount(0);
    await expect(page.getByTestId('data-source-badge')).toHaveText('Sample data');
    // The dashboard app actually rendered inside the frame.
    await expect(pane.frameLocator('iframe[title="Ground Truth Preview"]').locator('#root')).not.toBeEmpty();
  });
});
