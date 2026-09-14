import { expect, test } from '@playwright/test';

test('the clean shop renders and cart behavior works', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Useful objects for unhurried days.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByText('1 item', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review cart' }).click();
  await expect(page.getByRole('dialog', { name: 'Cart details' })).toContainText('Cart updated');
});
