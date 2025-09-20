import { test, expect } from '@playwright/test';

test('simulation shell initialises without runtime errors', async ({ page }) => {
  const pageErrors: unknown[] = [];
  const consoleErrors: string[] = [];

  page.on('pageerror', (error) => {
    pageErrors.push(error);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Field Prototype' })).toBeVisible();
  await expect(page.getByLabel('Simulation shell')).toBeVisible();
  await expect(page.locator('.simulation-shell canvas')).toHaveCount(1);

  await page.mouse.move(10, 10);
  await page.mouse.move(200, 150);
  await page.mouse.move(350, 220);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
