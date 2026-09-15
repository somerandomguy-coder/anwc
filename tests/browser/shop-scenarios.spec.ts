import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { diagnose } from '../../packages/diagnostics/src/index.js';

const captureFindings = async (page: Page) => page.evaluate(async () => {
  const api = (window as Window & { __ANWC__?: { capture(): Promise<unknown> } }).__ANWC__;
  return api!.capture();
});

test('each public defect scenario reproduces its independent DOM/layout condition', async ({ page }) => {
  await page.goto('/?scenario=horizontal-overflow');
  expect(await page.locator('[data-anwc-key="overflow-rail"]').evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  await page.goto('/?scenario=ancestor-clip');
  expect(await page.locator('.clip-action').evaluate((element) => element.getBoundingClientRect().width > element.parentElement!.getBoundingClientRect().width)).toBe(true);

  await page.goto('/lab?case=nested-clip');
  expect(await page.locator('.nested-clip-action').evaluate((element) => element.getBoundingClientRect().width > element.parentElement!.getBoundingClientRect().width)).toBe(true);

  await page.goto('/?scenario=line-budget');
  expect(await page.locator('[data-anwc-key="line-budget-title"]').evaluate((element) => element.getClientRects().length > 0)).toBe(true);

  await page.goto('/lab?case=text-clipped');
  expect(await page.locator('[data-anwc-key="text-clipped-title"]').evaluate((element) => element.getBoundingClientRect().height > element.parentElement!.clientHeight / 2)).toBe(true);

  await page.goto('/?scenario=hidden-checkout');
  await expect(page.getByRole('button', { name: 'Checkout' })).toBeHidden();

  await page.goto('/lab?case=opacity-checkout');
  await expect(page.getByRole('button', { name: 'Opacity-hidden checkout' })).toHaveCSS('opacity', '0');

  await page.goto('/?scenario=blocked-checkout');
  expect(await page.locator('[data-anwc-key="blocked-checkout"]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) !== element;
  })).toBe(true);

  await page.goto('/?scenario=partial-checkout');
  expect(await page.locator('[data-anwc-key="partial-checkout"]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const left = document.elementFromPoint(rect.left + rect.width / 4, rect.top + rect.height / 2);
    const right = document.elementFromPoint(rect.left + rect.width * .8, rect.top + rect.height / 2);
    return { left: left?.className, right: right?.className };
  })).toEqual({ left: 'cookie-obstacle', right: '' });

  await page.goto('/lab?case=outside-viewport');
  expect(await page.locator('[data-anwc-key="outside-viewport-checkout"]').evaluate((element) => element.getBoundingClientRect().top > window.innerHeight)).toBe(true);
});

test('ANWC reports the supported defect codes independently from scenario setup', async ({ page }) => {
  const expected = [
    ['horizontal-overflow', 'HORIZONTAL_OVERFLOW'], ['ancestor-clip', 'CLIPPED_BY_ANCESTOR'], ['nested-clip', 'CLIPPED_BY_ANCESTOR'],
    ['line-budget', 'TEXT_LINE_BUDGET_EXCEEDED'], ['text-clipped', 'TEXT_CLIPPED'], ['hidden-checkout', 'EXPECTED_VISIBLE_BUT_HIDDEN'],
    ['opacity-checkout', 'EXPECTED_VISIBLE_BUT_HIDDEN'], ['blocked-checkout', 'POINTER_BLOCKED_AT_SAMPLES'], ['partial-checkout', 'POINTER_PARTIALLY_BLOCKED'], ['outside-viewport', 'OUTSIDE_VIEWPORT']
  ] as const;
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) for (const [scenario, code] of expected) {
    await page.setViewportSize(viewport);
    await page.goto(`/lab?case=${scenario}`);
    const capture = await captureFindings(page);
    expect(diagnose(capture as Parameters<typeof diagnose>[0]).some((finding) => finding.code === code)).toBe(true);
  }
});

test('the clean scenario has no unacknowledged ANWC findings', async ({ page }) => {
  await page.goto('/?scenario=clean');
  const capture = await captureFindings(page);
  expect(diagnose(capture as Parameters<typeof diagnose>[0])).toEqual([]);
  expect((capture as { page: { scenario: string | null } }).page.scenario).toBe('clean');
});
