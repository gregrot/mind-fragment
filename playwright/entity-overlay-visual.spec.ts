import { test, expect } from '@playwright/test';

const STORY_ID = 'overlay-windows-entityoverlay--complex-entity';

const viewports = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'tablet', width: 900, height: 1024 },
] as const;

const tabs = [
  { label: 'Systems', id: 'systems' },
  { label: 'Programming', id: 'programming' },
  { label: 'Info', id: 'info' },
] as const;

test.describe('entity overlay visual regression', () => {
  test.use({ baseURL: 'http://127.0.0.1:6006' });

  for (const viewport of viewports) {
    test(`captures overlay tabs at ${viewport.name} resolution`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/iframe.html?id=${STORY_ID}&viewMode=story`, { waitUntil: 'networkidle' });

      const overlay = page.getByTestId('entity-overlay');
      await expect(overlay).toBeVisible();
      await expect(overlay.locator('[data-loading="true"]')).toHaveCount(0);

      for (const tab of tabs) {
        await page.getByRole('tab', { name: tab.label }).click();
        const panel = page.locator(`#simulation-overlay-panel-${tab.id}`);
        await expect(panel).toBeVisible();
        await expect(overlay).toHaveScreenshot(`entity-overlay-${viewport.name}-${tab.id}.png`, {
          animations: 'disabled',
        });
      }
    });
  }
});
