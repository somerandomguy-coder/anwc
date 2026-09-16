import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { diagnose } from '../../packages/diagnostics/src/index.js';

type ExpectedFixture = { url: string; targetKey: string; code: string; setup?: (page: Page) => Promise<void> };
const viewports = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];

async function targetCodes(page: Page, targetKey: string): Promise<string[]> {
  const snapshot = await page.evaluate(async () => (window as Window & { __ANWC__?: { capture(): Promise<unknown> } }).__ANWC__!.capture());
  const typed = snapshot as Parameters<typeof diagnose>[0];
  const target = typed.nodes.find((node) => node.semanticKey === targetKey);
  expect(target, `missing target ${targetKey}`).toBeDefined();
  return diagnose(typed).filter((finding) => finding.nodeId === target!.nodeId).map((finding) => finding.code);
}

const fixtures: ExpectedFixture[] = [
  { url: 'http://127.0.0.1:4176/?case=title-overflow&variant=broken', targetKey: 'pricing-growth-title', code: 'HORIZONTAL_OVERFLOW' },
  { url: 'http://127.0.0.1:4176/?case=description-crop&variant=broken', targetKey: 'pricing-growth-description', code: 'TEXT_CLIPPED' },
  { url: 'http://127.0.0.1:4176/?case=blocked-selection&variant=broken', targetKey: 'pricing-growth-action', code: 'POINTER_BLOCKED_AT_SAMPLES' },
  { url: 'http://127.0.0.1:4176/?case=hidden-selection&variant=broken', targetKey: 'pricing-growth-action', code: 'EXPECTED_VISIBLE_BUT_HIDDEN' },
  { url: 'http://127.0.0.1:4177/?case=clipped-save&variant=broken', targetKey: 'dashboard-save', code: 'CLIPPED_BY_ANCESTOR' },
  { url: 'http://127.0.0.1:4177/?case=long-title&variant=broken', targetKey: 'dashboard-task-title', code: 'TEXT_LINE_BUDGET_EXCEEDED' },
  { url: 'http://127.0.0.1:4177/?case=blocked-input&variant=broken', targetKey: 'dashboard-owner', code: 'POINTER_BLOCKED_AT_SAMPLES', setup: async (page) => { await page.getByRole('button', { name: 'Open task drawer' }).click(); } },
  { url: 'http://127.0.0.1:4177/?case=outside-save&variant=broken', targetKey: 'dashboard-save', code: 'OUTSIDE_VIEWPORT' }
];

test('pricing and dashboard broken fixtures produce their target-specific detector evidence', async ({ page }) => {
  for (const viewport of viewports) for (const fixture of fixtures) {
    await page.setViewportSize(viewport);
    await page.goto(fixture.url);
    if (fixture.setup) await fixture.setup(page);
    expect(await targetCodes(page, fixture.targetKey), `${fixture.url} at ${viewport.width}×${viewport.height}`).toContain(fixture.code);
  }
});

test('pricing and dashboard healthy counterparts omit their target-specific detector evidence', async ({ page }) => {
  for (const viewport of viewports) for (const fixture of fixtures) {
    await page.setViewportSize(viewport);
    await page.goto(fixture.url.replace('variant=broken', 'variant=healthy'));
    if (fixture.setup) await fixture.setup(page);
    expect(await targetCodes(page, fixture.targetKey), `${fixture.url} at ${viewport.width}×${viewport.height}`).not.toContain(fixture.code);
  }
});
