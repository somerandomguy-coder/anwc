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
  for (const fixture of cases) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:4176/?case=${fixture}&variant=broken`);
    await expect(page.getByRole('heading', { name: /Growth plan/ })).toBeAttached();
    await expect(page.locator('.plan').nth(1)).toContainText('Growth');
  }
});
