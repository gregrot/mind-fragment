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

  await page.addInitScript(() => {
    window.localStorage.setItem('mf.skipOnboarding', '1');
  });
  await page.goto('/');
  await expect(page.getByLabel('Simulation shell')).toBeVisible();
  await expect(page.locator('.simulation-shell canvas')).toHaveCount(1);
  const toolbar = page.getByRole('toolbar', { name: 'Simulation interface controls' });
  await expect(toolbar).toBeVisible();
  const programButton = toolbar.getByRole('button', { name: 'Program robot' });
  await expect(programButton).toBeVisible();
  await programButton.click();
  const overlay = page.getByTestId('entity-overlay');
  await expect(overlay).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Programming' })).toHaveAttribute('aria-selected', 'true');
  await overlay.getByRole('button', { name: 'Close' }).click();
  await expect(overlay).toBeHidden();

  await page.mouse.move(10, 10);
  await page.mouse.move(200, 150);
  await page.mouse.move(350, 220);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
