import { expect, test } from '@playwright/test';

test('the clean shop renders and cart behavior works', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Useful objects for unhurried days.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByText('1 item', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review cart' }).click();
  await expect(page.getByRole('dialog', { name: 'Cart details' })).toContainText('Cart updated');
});

test('the shop exposes normal catalog, checkout, account, and public lab routes', async ({ page }) => {
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { name: 'Everyday goods, made to last.' })).toBeVisible();
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Your quiet corner of the cart.' })).toBeVisible();
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Orders and details, in one place.' })).toBeVisible();
  await page.goto('/lab?case=blocked-checkout');
  await expect(page.getByRole('heading', { name: 'One visible defect at a time.' })).toBeVisible();
  await expect(page.locator('[data-anwc-key="blocked-checkout"]')).toBeVisible();
});
