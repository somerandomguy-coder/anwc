import { expect, test } from '@playwright/test';

test('the clean shop shell renders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ANWC shop starter' })).toBeVisible();
});
