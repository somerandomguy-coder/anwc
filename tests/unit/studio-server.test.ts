import { describe, expect, test, afterAll } from 'vitest';
import { startStudioServer, type StudioServerHandle } from '../../packages/cli/src/studio.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

describe('ANWC Studio HTTP Server', () => {
  let studio: StudioServerHandle | undefined;

  afterAll(async () => {
    if (studio) {
      await studio.close();
    }
  });

  test('starts on 127.0.0.1 with ephemeral or custom port and serves health endpoint', async () => {
    studio = await startStudioServer({
      port: 0,
      host: '127.0.0.1',
      openBrowser: false,
      inspectFn: async () => validSnapshotFixture
    });

    expect(studio.port).toBeGreaterThan(0);
    expect(studio.url).toBe(`http://127.0.0.1:${studio.port}`);

    const res = await fetch(`${studio.url}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      version: '0.1.0-alpha.0',
      service: 'anwc-studio'
    });
  });

  test('serves presets catalog via GET /api/presets', async () => {
    const res = await fetch(`${studio!.url}/api/presets`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.presets)).toBe(true);
    expect(body.presets.length).toBeGreaterThanOrEqual(3);
    expect(body.presets[0]).toHaveProperty('id');
    expect(body.presets[0]).toHaveProperty('title');
    expect(body.presets[0]).toHaveProperty('snapshot');
  });

  test('handles POST /api/inspect with validation and returns snapshot + report', async () => {
    const res = await fetch(`${studio!.url}/api/inspect`, {
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
    expect(body.report.schemaVersion).toBe('0.1');
  });

  test('rejects non-loopback host 0.0.0.0', async () => {
    await expect(startStudioServer({
      host: '0.0.0.0',
      port: 0
    })).rejects.toThrow("ANWC Studio server must bind to loopback (127.0.0.1). Binding to '0.0.0.0' is prohibited.");
  });

  test('rejects unsafe target URLs in POST /api/inspect', async () => {
    const res = await fetch(`${studio!.url}/api/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd' })
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Only http: and https:');
  });

  test('rejects malformed and markdown syntax target URLs in POST /api/inspect', async () => {
    // Malformed URL
    const malformedRes = await fetch(`${studio!.url}/api/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://' })
    });
    expect(malformedRes.status).toBe(400);
    const malformedBody = await malformedRes.json();
    expect(malformedBody.ok).toBe(false);
    expect(malformedBody.error).toContain('Only http: and https:');

    // Markdown link syntax
    const mdRes = await fetch(`${studio!.url}/api/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: '[My Page](http://127.0.0.1:4174)' })
    });
    expect(mdRes.status).toBe(400);
    const mdBody = await mdRes.json();
    expect(mdBody.ok).toBe(false);
    expect(mdBody.error).toContain('Markdown');
  });

  test('accepts uploaded capture payload via POST /api/upload', async () => {
    const res = await fetch(`${studio!.url}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validSnapshotFixture)
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.snapshot).toBeDefined();
    expect(body.report).toBeDefined();
  });

  test('serves fallback HTML when static dir does not yet contain custom index.html', async () => {
    const res = await fetch(`${studio!.url}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('ANWC Studio');
  });

  test('handles port collision by falling back to ephemeral free port', async () => {
    // Attempt to bind to the same port as the currently running studio
    const portInUse = studio!.port;
    const secondStudio = await startStudioServer({
      port: portInUse,
      host: '127.0.0.1',
      openBrowser: false,
      inspectFn: async () => validSnapshotFixture
    });

    try {
      expect(secondStudio.port).toBeGreaterThan(0);
      expect(secondStudio.port).not.toBe(portInUse);
      const res = await fetch(`${secondStudio.url}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    } finally {
      await secondStudio.close();
    }
  });

  test('preloaded capture via capturePath is reflected in /api/health', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const tempFile = join(tmpdir(), `temp-capture-${Date.now()}.json`);
    await writeFile(tempFile, JSON.stringify(validSnapshotFixture), 'utf8');

    const captureStudio = await startStudioServer({
      port: 0,
      host: '127.0.0.1',
      openBrowser: false,
      capturePath: tempFile,
      inspectFn: async () => validSnapshotFixture
    });

    try {
      const res = await fetch(`${captureStudio.url}/api/health`);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.preloadedCapture).toBe(true);
    } finally {
      await captureStudio.close();
      await unlink(tempFile).catch(() => {});
    }
  });

  test('returns 500 when inspectFn throws an error', async () => {
    const failingStudio = await startStudioServer({
      port: 0,
      host: '127.0.0.1',
      openBrowser: false,
      inspectFn: async () => {
        throw new Error('Connection refused to target page');
      }
    });

    try {
      const res = await fetch(`${failingStudio.url}/api/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'http://127.0.0.1:9999' })
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Connection refused to target page');
    } finally {
      await failingStudio.close();
    }
  });

  test('handles CORS preflight OPTIONS request', async () => {
    const res = await fetch(`${studio!.url}/api/inspect`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST'
      }
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  test('returns 404 for unknown routes and does not intercept GET /api/* with SPA html', async () => {
    const postRes = await fetch(`${studio!.url}/api/unknown-endpoint`, {
      method: 'POST'
    });
    expect(postRes.status).toBe(404);
    const postBody = await postRes.json();
    expect(postBody.ok).toBe(false);

    const getRes = await fetch(`${studio!.url}/api/unknown-endpoint`);
    expect(getRes.status).toBe(404);
    expect(getRes.headers.get('Content-Type')).toContain('application/json');
    const getBody = await getRes.json();
    expect(getBody).toEqual({ ok: false, error: 'Not found' });
  });
});
