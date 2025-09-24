import { test, expect } from '@playwright/test';

test('systems tab shows chassis inspector with module slots', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('mf.skipOnboarding', '1');
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Systems' }).click();
  const overlay = page.getByTestId('entity-overlay');
  await expect(overlay).toBeVisible();

  await expect(overlay.getByRole('tab', { name: 'Systems' })).toHaveAttribute('aria-selected', 'true');
  await expect(overlay.getByRole('heading', { name: 'Chassis Configuration' })).toBeVisible();
  await expect(overlay.getByTestId('chassis-inspector')).toBeVisible();
  await expect(overlay.getByTestId('chassis-slot-core-0')).toBeVisible();

  await overlay.getByRole('button', { name: 'Close' }).click();
  await expect(overlay).toBeHidden();
});
