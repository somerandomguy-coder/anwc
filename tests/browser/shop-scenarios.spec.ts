import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { diagnose } from '../../packages/diagnostics/src/index.js';
import { developmentFixtureCases, type FixtureCase } from '../../examples/shop/src/scenarios.js';

const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];

const capture = async (page: Page) => page.evaluate(async () => {
  const api = (window as Window & { __ANWC__?: { capture(): Promise<unknown> } }).__ANWC__;
  return api!.capture();
});

const targetFindings = async (page: Page, targetKey: string) => {
  const result = await capture(page);
  const typed = result as Parameters<typeof diagnose>[0];
  const target = typed.nodes.find((node) => node.semanticKey === targetKey);
  expect(target, `missing target ${targetKey}`).toBeDefined();
  return diagnose(typed).filter((finding) => finding.nodeId === target!.nodeId);
};

async function browserRangeLineCount(page: Page, targetKey: string): Promise<number> {
  return page.locator(`[data-anwc-key="${targetKey}"]`).evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => Math.round(rect.top));
    return new Set(tops).size;
  });
}

async function assertBrokenTruth(page: Page, fixture: FixtureCase): Promise<void> {
  const target = page.locator(`[data-anwc-key="${fixture.targetKey}"]`);
  if (fixture.id === 'horizontal-overflow') {
    await expect(target.evaluate((element) => element.scrollWidth > element.clientWidth)).resolves.toBe(true);
  } else if (fixture.id === 'ancestor-clip' || fixture.id === 'nested-clip') {
    await expect(target.evaluate((element) => element.getBoundingClientRect().right > element.parentElement!.getBoundingClientRect().right)).resolves.toBe(true);
  } else if (fixture.id === 'line-budget') {
    expect(await browserRangeLineCount(page, fixture.targetKey)).toBeGreaterThan(2);
  } else if (fixture.id === 'text-clipped') {
    await expect(target.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const boundary = element.parentElement!.getBoundingClientRect();
      return [...range.getClientRects()].some((rect) => rect.bottom > boundary.bottom + .5);
    })).resolves.toBe(true);
  } else if (fixture.id === 'hidden-checkout') {
    await expect(target).toBeHidden();
  } else if (fixture.id === 'opacity-checkout') {
    await expect(target).toHaveCSS('opacity', '0');
  } else if (fixture.id === 'blocked-checkout') {
    await expect(target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) !== element;
    })).resolves.toBe(true);
  } else if (fixture.id === 'partial-checkout') {
    await expect(target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const left = document.elementFromPoint(rect.left + rect.width / 4, rect.top + rect.height / 2);
      const right = document.elementFromPoint(rect.left + rect.width * .8, rect.top + rect.height / 2);
      return left !== element && right === element;
    })).resolves.toBe(true);
  } else if (fixture.id === 'outside-viewport') {
    await expect(target.evaluate((element) => element.getBoundingClientRect().top >= window.innerHeight)).resolves.toBe(true);
  }
}

async function assertHealthyTruth(page: Page, fixture: FixtureCase): Promise<void> {
  const target = page.locator(`[data-anwc-key="${fixture.targetKey}"]`);
  if (fixture.id === 'horizontal-overflow') {
    await expect(target.evaluate((element) => element.scrollWidth <= element.clientWidth)).resolves.toBe(true);
  } else if (fixture.id === 'ancestor-clip' || fixture.id === 'nested-clip') {
    await expect(target.evaluate((element) => element.getBoundingClientRect().right <= element.parentElement!.getBoundingClientRect().right + .5)).resolves.toBe(true);
  } else if (fixture.id === 'line-budget') {
    expect(await browserRangeLineCount(page, fixture.targetKey)).toBeLessThanOrEqual(2);
    await expect(target).toContainText('A deliberately long product title');
  } else if (fixture.id === 'text-clipped') {
    await expect(target.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const boundary = element.parentElement!.getBoundingClientRect();
      return [...range.getClientRects()].every((rect) => rect.bottom <= boundary.bottom + .5);
    })).resolves.toBe(true);
  } else if (fixture.id === 'hidden-checkout') {
    await expect(target).toBeVisible();
  } else if (fixture.id === 'opacity-checkout') {
    await expect(target).toHaveCSS('opacity', '1');
  } else if (fixture.id === 'blocked-checkout' || fixture.id === 'partial-checkout') {
    await expect(target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return [rect.left + rect.width / 4, rect.left + rect.width * .8].every((x) => {
        const hit = document.elementFromPoint(x, rect.top + rect.height / 2);
        return hit === element || element.contains(hit);
      });
    })).resolves.toBe(true);
  } else if (fixture.id === 'outside-viewport') {
    await expect(target.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    })).resolves.toBe(true);
  }
}

test('every broken fixture has independent browser truth and a target-specific ANWC finding', async ({ page }) => {
  for (const viewport of viewports) for (const fixture of developmentFixtureCases) {
    await page.setViewportSize(viewport);
    await page.goto(`/lab?case=${fixture.id}&variant=broken`);
    await assertBrokenTruth(page, fixture);
    expect((await targetFindings(page, fixture.targetKey)).some((finding) => finding.code === fixture.expectedCode)).toBe(true);
  }
});

test('every healthy fixture keeps its content/action and has no target-specific actionable finding', async ({ page }) => {
  for (const viewport of viewports) for (const fixture of developmentFixtureCases) {
    await page.setViewportSize(viewport);
    await page.goto(`/lab?case=${fixture.id}&variant=healthy`);
    await assertHealthyTruth(page, fixture);
    expect((await targetFindings(page, fixture.targetKey)).some((finding) => finding.code === fixture.expectedCode && finding.severity !== 'info')).toBe(false);
    if (fixture.actionRequired) {
      await page.locator(`[data-anwc-key="${fixture.targetKey}"]`).click();
      await expect(page.getByRole('dialog', { name: 'Checkout confirmation' })).toContainText('Checkout confirmed');
    }
  }
});

test('the clean scenario has no unacknowledged ANWC findings', async ({ page }) => {
  await page.goto('/?scenario=clean');
  const result = await capture(page);
  expect(diagnose(result as Parameters<typeof diagnose>[0])).toEqual([]);
  expect((result as { page: { scenario: string | null } }).page.scenario).toBe('clean');
});
