import { test, expect } from '@playwright/test';
import { workspaceDropzone, dragPaletteBlock } from './drag-helpers';

test.describe('resource scanning and gathering', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('mf.skipOnboarding', '1');
    });
    await page.goto('/');
    await page.getByTestId('select-mechanism').last().click();
    await expect(page.getByTestId('entity-overlay')).toBeVisible();

    const stopButton = page.getByTestId('stop-program');
    if (await stopButton.isEnabled()) {
      await stopButton.click();
    }
    await expect(page.getByTestId('run-program')).toBeEnabled();
  });

  test('player can scan the area and gather resources into cargo', async ({ page }) => {
    await dragPaletteBlock(page, 'start', workspaceDropzone);
    await dragPaletteBlock(page, 'scan-resources', '[data-testid="slot-do-dropzone"]');
    await dragPaletteBlock(page, 'gather-resource', '[data-testid="slot-do-dropzone"]');

    await page.getByTestId('run-program').click();

    await expect(page.getByText('Routine completed')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Info' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Info' })).toContainText('Mechanism MF-01');
  });
});
