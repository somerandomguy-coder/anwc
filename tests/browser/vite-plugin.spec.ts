import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test.describe.configure({ mode: 'serial' });

test('development instrumentation links rendered JSX nodes to original source', async ({ page }) => {
  await page.goto('/');
  const report = await page.evaluate(async () => {
    const api = (window as Window & { __ANWC__?: { version: string; capture(): Promise<{ nodes: Array<{ tag: string; source: { file: string; line: number } | null }> }> } }).__ANWC__;
    return api ? { version: api.version, capture: await api.capture(), attributes: document.querySelectorAll('[data-anwc-site]').length } : null;
  });
  expect(report).not.toBeNull();
  expect(report?.version).toBe('0.1');
  expect(report?.attributes).toBeGreaterThan(0);
  expect(report?.capture.nodes.some((node) => node.tag === 'h1' && node.source?.file === 'examples/shop/src/main.tsx' && node.source.line > 0)).toBe(true);
});

test('source manifest refreshes with Vite HMR', async ({ page }) => {
  const probePath = join(process.cwd(), 'examples', 'shop', 'src', 'HmrProbe.tsx');
  const original = await readFile(probePath, 'utf8');
  await page.goto('/');
  try {
    await page.getByRole('button', { name: 'Load source probe' }).click();
    await expect(page.getByText('First probe')).toBeVisible();
    await writeFile(probePath, original.replace('<p>First probe</p>', '<button>Second probe</button>'));
    await expect(page.getByRole('button', { name: 'Second probe' })).toBeVisible();
    const source = await page.evaluate(async () => {
      const api = (window as Window & { __ANWC__?: { capture(): Promise<{ nodes: Array<{ label: string; tag: string; source: { siteId: string; file: string; tag: string } | null }> }> } }).__ANWC__;
      return (await api!.capture()).nodes.find((node) => node.label === 'Second probe')?.source;
    });
    expect(source).toMatchObject({ file: 'examples/shop/src/HmrProbe.tsx', tag: 'button' });
    await writeFile(probePath, "export function HmrProbe() { return 'Probe removed'; }\n");
    await expect(page.getByText('Second probe')).toHaveCount(0);
    const stale = await page.evaluate((siteId) => {
      const api = (window as Window & { __ANWC__?: { sourceForSite(value: string): unknown } }).__ANWC__!;
      return api.sourceForSite(siteId);
    }, source!.siteId);
    expect(stale).toBeNull();
  } finally {
    await writeFile(probePath, original);
  }
});

test('keeps pre-runtime source registrations and registers a lazy module on demand', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { __ANWC_PENDING_SOURCES__?: Record<string, Record<string, unknown>> }).__ANWC_PENDING_SOURCES__ = {
      'delayed-entry.tsx': { s_delayed_entry: { siteId: 's_delayed_entry', file: 'examples/delayed-entry.tsx', line: 1, column: 1, tag: 'button' } }
    };
  });
  await page.goto('/');
  const before = await page.evaluate(async () => {
    const api = (window as Window & { __ANWC__?: { capture(): Promise<{ nodes: Array<{ label: string }> }> } }).__ANWC__!;
    return (await api.capture()).nodes.some((node) => node.label === 'First probe');
  });
  expect(before).toBe(false);

  const delayedSource = await page.evaluate(async () => {
    document.querySelector('footer')!.insertAdjacentHTML('beforeend', '<button data-anwc-site="s_delayed_entry">Delayed entry</button>');
    const runtimeWindow = window as Window & { __ANWC__?: { capture(): Promise<{ nodes: Array<{ label: string; source: { file: string } | null }> }>; sourceForSite(siteId: string): unknown }; __ANWC_PENDING_SOURCES__?: Record<string, unknown> };
    const source = (await runtimeWindow.__ANWC__!.capture()).nodes.find((node) => node.label === 'Delayed entry')?.source;
    return { source, direct: runtimeWindow.__ANWC__!.sourceForSite('s_delayed_entry'), pending: runtimeWindow.__ANWC_PENDING_SOURCES__ };
  });
  expect(delayedSource.pending).toHaveProperty(['delayed-entry.tsx']);
  expect(delayedSource).toMatchObject({ direct: { file: 'examples/delayed-entry.tsx' }, source: { file: 'examples/delayed-entry.tsx' } });

  await page.getByRole('button', { name: 'Load source probe' }).click();
  await expect(page.getByText('First probe')).toBeVisible();
  const lazySource = await page.evaluate(async () => {
    const api = (window as Window & { __ANWC__?: { capture(): Promise<{ nodes: Array<{ label: string; source: { file: string; tag: string } | null }> }> } }).__ANWC__!;
    return (await api.capture()).nodes.find((node) => node.label === 'First probe')?.source;
  });
  expect(lazySource).toMatchObject({ file: 'examples/shop/src/HmrProbe.tsx', tag: 'p' });
});
