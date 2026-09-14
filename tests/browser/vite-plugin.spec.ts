import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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
    await writeFile(probePath, original.replace('<p>First probe</p>', '<button>Second probe</button>'));
    await expect(page.getByRole('button', { name: 'Second probe' })).toBeVisible();
    const source = await page.evaluate(async () => {
      const api = (window as Window & { __ANWC__?: { capture(): Promise<{ nodes: Array<{ label: string; tag: string; source: { file: string; tag: string } | null }> }> } }).__ANWC__;
      return (await api!.capture()).nodes.find((node) => node.label === 'Second probe')?.source;
    });
    expect(source).toMatchObject({ file: 'examples/shop/src/HmrProbe.tsx', tag: 'button' });
  } finally {
    await writeFile(probePath, original);
  }
});
