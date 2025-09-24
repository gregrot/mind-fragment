import { test, expect } from '@playwright/test';

test('systems tab shows placeholder messaging while inspectors are in development', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('mf.skipOnboarding', '1');
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Systems' }).click();
  const overlay = page.getByTestId('entity-overlay');
  await expect(overlay).toBeVisible();

  await expect(overlay.getByRole('tab', { name: 'Systems' })).toHaveAttribute('aria-selected', 'true');
  await expect(overlay.getByText('Systems management is coming soon.')).toBeVisible();

  await overlay.getByRole('button', { name: 'Close' }).click();
  await expect(overlay).toBeHidden();
});
