import { appendFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { startStudioServer, type StudioServerHandle } from '../../packages/cli/src/studio.js';

const root = resolve(import.meta.dirname, '../..');

test.describe('studio before and after', () => {
  let app: ViteDevServer;
  let studio: StudioServerHandle;
  let directory: string;

  test.beforeAll(async () => {
    // Inside the repository so the copy resolves the workspace packages; artifacts/ is ignored.
    mkdirSync(join(root, 'artifacts'), { recursive: true });
    directory = mkdtempSync(join(root, 'artifacts/studio-compare-'));
    cpSync(join(root, 'examples/shop'), join(directory, 'shop'), {
      recursive: true,
      filter: (source) => !/[\\/](node_modules|dist|tsconfig\.json)$/.test(source)
    });
    app = await createServer({
      root: join(directory, 'shop'),
      configFile: join(directory, 'shop/vite.config.ts'),
      logLevel: 'error',
      server: { host: '127.0.0.1', port: 0 }
    });
    await app.listen();
    studio = await startStudioServer({ port: 0, openBrowser: false });
  });

  test.afterAll(async () => {
    await studio?.close();
    await app?.close();
    rmSync(directory, { recursive: true, force: true });
  });

  test('overlay boxes sit on the page, and a real repair is reported without overclaiming', async ({ page }) => {
    const address = app.httpServer!.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/lab?case=blocked-checkout`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(studio.url);
    await page.getByTestId('url-input').fill(url);
    await page.getByTestId('inspect-button').click();
    await expect(page.getByTestId('data-source-badge')).toHaveText('Live capture', { timeout: 30_000 });
    await expect(page.getByTestId('finding-list')).toContainText('25 of 25 points blocked');
    await expect(page.getByTestId('compare-panel')).toHaveCount(0);

    await page.getByTestId('overlay-toggle').click();
    const onPage = await page.getByTestId('ground-truth-highlight').boundingBox();
    const inXray = await page.locator('.xray-target-box rect').boundingBox();
    expect(Math.abs(onPage!.x - inXray!.x)).toBeLessThan(1.5);
    expect(Math.abs(onPage!.y - inXray!.y)).toBeLessThan(1.5);
    await page.getByTestId('overlay-toggle').click();

    appendFileSync(
      join(directory, 'shop/src/styles.css'),
      '\n.blocked.obstacle-fixture { height: auto; }\n.blocked.obstacle-fixture > button { min-height: 4.5rem; }\n.blocked .cookie-obstacle { position: static; }\n'
    );
    await expect
      .poll(async () => (await fetch(`http://127.0.0.1:${address.port}/src/styles.css?direct`)).text())
      .toContain('.blocked .cookie-obstacle { position: static; }');

    await page.getByTestId('inspect-button').click();
    const panel = page.getByTestId('compare-panel');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel.locator('li')).toHaveAttribute('data-verdict', 'unverified');
    await panel.getByRole('button', { name: 'Before' }).click();
    await expect(page.getByTestId('finding-list')).toContainText('25 of 25 points blocked');
  });
});
