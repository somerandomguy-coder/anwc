import { expect, test } from '@playwright/test';

const cases = ['title-overflow', 'description-crop', 'blocked-selection', 'hidden-selection'] as const;

test('each pricing fixture preserves content and selection behavior in its healthy counterpart', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const fixture of cases) {
      await page.goto(`http://127.0.0.1:4176/?case=${fixture}&variant=healthy`);
      const action = page.getByRole('button', { name: 'Choose Growth' });
      await expect(action).toBeVisible();
      await action.click();
      await expect(page.getByRole('status')).toHaveText('Growth plan selected');
    }
  }
});

test('each broken pricing fixture keeps the target in the real plan component', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) for (const fixture of cases) {
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:4176/?case=${fixture}&variant=broken`);
    await expect(page.getByRole('heading', { name: /Growth plan/ })).toBeAttached();
    await expect(page.locator('.plan').nth(1)).toContainText('Growth');
  }
});

test('each broken pricing counterpart has independent browser evidence for its declared layout or interaction fault', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) for (const fixture of cases) {
    await page.setViewportSize(viewport);
    await page.goto(`http://127.0.0.1:4176/?case=${fixture}&variant=broken`);
    const plan = page.locator('.plan').nth(1);
    const action = page.getByRole('button', { name: 'Choose Growth' });
    if (fixture === 'title-overflow') {
      await expect(page.getByRole('heading', { name: /Growth plan/ }).evaluate((element) => {
        const range = document.createRange(); range.selectNodeContents(element);
        const boundary = element.parentElement!.getBoundingClientRect();
        return [...range.getClientRects()].some((rect) => rect.right > boundary.right + .5);
      })).resolves.toBe(true);
    } else if (fixture === 'description-crop') {
      await expect(plan.locator('.growth-description').evaluate((element) => {
        const range = document.createRange(); range.selectNodeContents(element);
        const boundary = element.getBoundingClientRect();
        return [...range.getClientRects()].some((rect) => rect.bottom > boundary.bottom + .5);
      })).resolves.toBe(true);
    } else if (fixture === 'blocked-selection') {
      await expect(action.evaluate((element) => { const box = element.getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) !== element; })).resolves.toBe(true);
    } else {
      await expect(action).toHaveCSS('opacity', '0');
    }
  }
});
