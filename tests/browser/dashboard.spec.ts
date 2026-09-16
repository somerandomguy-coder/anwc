import { expect, test } from '@playwright/test';

const cases = ['clipped-save', 'long-title', 'blocked-input', 'outside-save'] as const;

test('healthy dashboard counterparts preserve tab, drawer, and save behavior', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const fixture of cases) {
      await page.goto(`http://127.0.0.1:4177/?case=${fixture}&variant=healthy`);
      await page.getByRole('button', { name: 'Tasks' }).click();
      await expect(page.getByRole('heading', { name: 'Task list' })).toBeVisible();
      await page.getByRole('button', { name: 'Open task drawer' }).click();
      await expect(page.getByRole('dialog', { name: 'Task drawer' })).toBeVisible();
      await page.getByRole('button', { name: 'Save changes' }).last().click();
      await expect(page.getByRole('status')).toHaveText('Changes saved');
    }
  }
});

test('broken dashboard cases retain their real stateful controls', async ({ page }) => {
  for (const fixture of cases) {
    await page.goto(`http://127.0.0.1:4177/?case=${fixture}&variant=broken`);
    await page.getByRole('button', { name: 'Open task drawer' }).click();
    await expect(page.getByRole('dialog', { name: 'Task drawer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes' }).last()).toBeAttached();
  }
});

test('each broken dashboard counterpart has independent browser evidence for its declared layout or interaction fault', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) for (const fixture of cases) {
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:4177/?case=${fixture}&variant=broken`);
    if (fixture === 'clipped-save') {
      await expect(page.getByRole('button', { name: 'Save changes' }).first().evaluate((element) => element.getBoundingClientRect().bottom > element.parentElement!.getBoundingClientRect().bottom + .5)).resolves.toBe(true);
    } else if (fixture === 'long-title') {
      await expect(page.locator('.board article p').evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); return new Set([...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).map((rect) => Math.round(rect.top))).size > 2; })).resolves.toBe(true);
    } else if (fixture === 'blocked-input') {
      await page.getByRole('button', { name: 'Open task drawer' }).click();
      await expect(page.getByRole('textbox', { name: 'Owner' }).evaluate((element) => { const box = element.getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) !== element; })).resolves.toBe(true);
    } else {
      await expect(page.getByRole('button', { name: 'Save changes' }).first().evaluate((element) => element.getBoundingClientRect().top >= window.innerHeight)).resolves.toBe(true);
    }
  }
});
