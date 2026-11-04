import { describe, expect, test, afterAll, beforeAll } from 'vitest';
import { startStudioServer, type StudioServerHandle } from '../../packages/cli/src/studio.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ANWC Studio End-to-End Integration', () => {
  let handle: StudioServerHandle | undefined;
  const studioDistDir = join(process.cwd(), 'packages', 'cli', 'dist', 'studio');
  const indexPath = join(studioDistDir, 'index.html');

  beforeAll(async () => {
    handle = await startStudioServer({
      port: 0,
      openBrowser: false,
      inspectFn: async () => validSnapshotFixture
    });
  });

  afterAll(async () => {
    if (handle) {
      await handle.close();
    }
  });

  test('studio bundle index.html is generated in cli/dist/studio and is non-empty', () => {
    expect(existsSync(indexPath)).toBe(true);
    const stats = statSync(indexPath);
    expect(stats.size).toBeGreaterThan(0);

    const html = readFileSync(indexPath, 'utf8');
    expect(html).toContain('<div id="root">');
  });

  test('anwc studio serves bundled index.html on GET /', async () => {
    expect(handle).toBeDefined();
    const res = await fetch(`${handle!.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const html = await res.text();
    expect(html).toContain('<div id="root">');
    expect(html).toContain('ANWC Studio');
  });

  test('anwc studio serves compiled static assets under /assets/', async () => {
    expect(handle).toBeDefined();
    const assetsDir = join(studioDistDir, 'assets');
    expect(existsSync(assetsDir)).toBe(true);

    const assetFiles = readdirSync(assetsDir);
    expect(assetFiles.length).toBeGreaterThanOrEqual(1);

    for (const assetFile of assetFiles) {
      const res = await fetch(`${handle!.url}/assets/${assetFile}`);
      expect(res.status).toBe(200);

      const contentType = res.headers.get('content-type') || '';
      if (assetFile.endsWith('.js')) {
        expect(contentType).toContain('javascript');
      } else if (assetFile.endsWith('.css')) {
        expect(contentType).toContain('text/css');
      }

      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
    }
  });

  test('anwc studio responds to GET /api/health', async () => {
    expect(handle).toBeDefined();
    const res = await fetch(`${handle!.url}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      service: 'anwc-studio',
      version: '0.1.0-alpha.0'
    });
  });

  test('anwc studio responds to GET /api/presets', async () => {
    expect(handle).toBeDefined();
    const res = await fetch(`${handle!.url}/api/presets`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.presets)).toBe(true);
    expect(body.presets.length).toBeGreaterThanOrEqual(3);
  });

  test('anwc studio handles POST /api/inspect', async () => {
    expect(handle).toBeDefined();
    const res = await fetch(`${handle!.url}/api/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://127.0.0.1:4174',
        viewport: { width: 390, height: 844 }
      })
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshot).toBeDefined();
    expect(body.report).toBeDefined();
    expect(body.snapshot.nodes.length).toBeGreaterThan(0);
  });

  test('SPA fallback serves index.html for non-asset routes', async () => {
    expect(handle).toBeDefined();
    const res = await fetch(`${handle!.url}/deep/client/route`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
  });
});
