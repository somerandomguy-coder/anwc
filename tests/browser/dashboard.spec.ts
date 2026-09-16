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
