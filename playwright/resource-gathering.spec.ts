import { test, expect, type Page } from '@playwright/test';

const workspaceDropzone = '[data-testid="workspace-dropzone"]';

async function performDragAndDrop(page: Page, sourceSelector: string, targetSelector: string): Promise<void> {
  await page.evaluate(({ sourceSelector, targetSelector }) => {
    const source = document.querySelector(sourceSelector);
    const target = document.querySelector(targetSelector);
    if (!source) {
      throw new Error(`No drag source found for selector: ${sourceSelector}`);
    }
    if (!target) {
      throw new Error(`No drop target found for selector: ${targetSelector}`);
    }

    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  }, { sourceSelector, targetSelector });
}

async function dragPaletteBlock(page: Page, blockId: string, targetSelector: string): Promise<void> {
  await performDragAndDrop(page, `[data-testid="palette-${blockId}"]`, targetSelector);
}

test.describe('resource scanning and gathering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('select-robot').last().click();
    await expect(page.getByTestId('robot-programming-overlay')).toBeVisible();
  });

  test('player can scan the area and gather resources into cargo', async ({ page }) => {
    await dragPaletteBlock(page, 'start', workspaceDropzone);
    await dragPaletteBlock(page, 'scan-resources', '[data-testid="slot-do-dropzone"]');
    await dragPaletteBlock(page, 'gather-resource', '[data-testid="slot-do-dropzone"]');

    await page.getByTestId('run-program').click();

    await expect(page.getByText('Routine completed')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('tab', { name: 'Inventory' }).click();
    await expect(page.getByTestId('inventory-status')).toBeVisible();
    const contents = page.getByTestId('inventory-contents');
    await expect(contents).toBeVisible();
    await expect(contents).toContainText('Ferrous Ore');
    await expect(contents).toContainText('units');
  });
});
