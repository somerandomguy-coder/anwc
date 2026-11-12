import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { probeTarget, startStudioServer, type StudioServerHandle } from '../../packages/cli/src/studio.js';
import { STUDIO_PRESETS as CLI_PRESETS } from '../../packages/cli/src/studio-presets.js';
import { STUDIO_PRESETS as UI_PRESETS } from '../../packages/studio/src/data/presets.js';
import { EXAMPLE_TARGETS, exampleTargetFor } from '../../packages/studio/src/data/targets.js';
import { GroundTruthPane } from '../../packages/studio/src/components/GroundTruthPane.js';
import { validSnapshotFixture } from '../../packages/protocol/test/fixtures.js';

const viewport = { width: 390, height: 844 };
const repoRoot = resolve(import.meta.dirname, '../..');

function refusedFetch(): typeof fetch {
  return (async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  }) as typeof fetch;
}

describe('P10 target health probe', () => {
  test('any HTTP response counts as reachable, including errors', async () => {
    const fetch404 = (async () => new Response('missing', { status: 404 })) as typeof fetch;
    await expect(probeTarget('http://127.0.0.1:4175/', fetch404)).resolves.toEqual({ reachable: true, status: 404 });
  });

  test('connection refused and timeouts are unreachable with a reason', async () => {
    await expect(probeTarget('http://127.0.0.1:4176/', refusedFetch())).resolves.toEqual({
      reachable: false,
      reason: 'connection_refused'
    });
    const timeoutFetch = (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as typeof fetch;
    await expect(probeTarget('http://127.0.0.1:4176/', timeoutFetch)).resolves.toEqual({ reachable: false, reason: 'timeout' });
  });

  test('a real closed loopback port is reported unreachable', async () => {
    const closed = await startStudioServer({ port: 0, openBrowser: false, inspectFn: async () => validSnapshotFixture });
    const url = `${closed.url}/`;
    await closed.close();
    const result = await probeTarget(url);
    expect(result.reachable).toBe(false);
  });
});

describe('P10 /api/target-status', () => {
  let studio: StudioServerHandle | undefined;

  afterAll(async () => {
    await studio?.close();
  });

  test('reports unreachable targets and rejects unsafe URLs', async () => {
    studio = await startStudioServer({
      port: 0,
      openBrowser: false,
      inspectFn: async () => validSnapshotFixture,
      fetchFn: refusedFetch()
    });

    const ok = await fetch(`${studio.url}/api/target-status?url=${encodeURIComponent('http://127.0.0.1:4177/?case=outside-save')}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      ok: true,
      url: 'http://127.0.0.1:4177/?case=outside-save',
      reachable: false,
      reason: 'connection_refused'
    });

    for (const bad of ['', 'file:///etc/passwd', 'javascript:alert(1)', '[app](http://127.0.0.1:4175/)']) {
      const res = await fetch(`${studio.url}/api/target-status?url=${encodeURIComponent(bad)}`);
      expect(res.status, bad).toBe(400);
    }
  });
});

describe('P10 unreachable preview panel', () => {
  test('shows the start command for a known example instead of an iframe', () => {
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        url: 'http://127.0.0.1:4176/?case=description-crop&variant=broken',
        viewport,
        initialTargetHealth: { state: 'unreachable', reason: 'connection_refused' }
      })
    );
    expect(html).not.toContain('<iframe');
    expect(html).toContain('data-testid="target-unreachable"');
    expect(html).toContain('Nothing is answering at http://127.0.0.1:4176');
    expect(html).toContain(EXAMPLE_TARGETS.pricing.startCommand);
    expect(html).toContain('Retry');
  });

  test('gives generic guidance for an unknown app', () => {
    const html = renderToStaticMarkup(
      React.createElement(GroundTruthPane, {
        url: 'http://127.0.0.1:5173/',
        viewport,
        initialTargetHealth: { state: 'unreachable' }
      })
    );
    expect(html).toContain('Start your app');
    expect(html).not.toContain('data-testid="target-start-command"');
  });

  test('keeps the iframe while health is unknown or reachable', () => {
    for (const state of ['unknown', 'checking', 'reachable'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(GroundTruthPane, { url: 'http://127.0.0.1:4175/', viewport, initialTargetHealth: { state } })
      );
      expect(html, state).toContain('<iframe');
    }
  });

  test('maps localhost to the same example as 127.0.0.1', () => {
    expect(exampleTargetFor('http://localhost:4175/lab')?.id).toBe('shop');
    expect(exampleTargetFor('http://127.0.0.1:9999/')).toBeNull();
    expect(exampleTargetFor('not a url')).toBeNull();
  });
});

describe('P10 built-in presets are honest', () => {
  test('both preset copies agree and point at documented example apps', () => {
    expect(CLI_PRESETS.map((p) => [p.id, p.snapshot.page.url])).toEqual(UI_PRESETS.map((p) => [p.id, p.snapshot.page.url]));
    for (const preset of UI_PRESETS) {
      expect(exampleTargetFor(preset.snapshot.page.url), preset.id).not.toBeNull();
    }
  });

  test('every preset source reference names a real JSX element at that line and column', () => {
    for (const preset of [...UI_PRESETS, ...CLI_PRESETS]) {
      for (const node of preset.snapshot.nodes) {
        if (!node.source) continue;
        const lines = readFileSync(resolve(repoRoot, node.source.file), 'utf8').split(/\r?\n/);
        const line = lines[node.source.line - 1] ?? '';
        expect(line.slice(node.source.column - 1), `${preset.id} ${node.source.file}:${node.source.line}`).toMatch(
          new RegExp(`^<${node.source.tag}\\b`)
        );
      }
    }
  });
});
