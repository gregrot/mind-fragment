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

async function dragWorkspaceBlock(page: Page, blockId: string, targetSelector: string): Promise<void> {
  await performDragAndDrop(page, `[data-testid="block-${blockId}"]`, targetSelector);
}

test.describe('block workspace drag-and-drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('adds a palette block to the workspace root', async ({ page }) => {
    await dragPaletteBlock(page, 'start', workspaceDropzone);

    await expect(page.getByTestId('block-start')).toHaveCount(1);
    await expect(page.locator(`${workspaceDropzone} .block`)).toHaveCount(1);
  });

  test('nests a block inside another block slot', async ({ page }) => {
    await dragPaletteBlock(page, 'start', workspaceDropzone);
    await dragPaletteBlock(page, 'move', '[data-testid="slot-do-dropzone"]');

    const slot = page.getByTestId('slot-do-dropzone');
    await expect(slot.getByTestId('block-move')).toHaveCount(1);
    await expect(slot.locator('.slot-placeholder')).toHaveCount(0);
  });

  test('moves a block between containers', async ({ page }) => {
    await dragPaletteBlock(page, 'start', workspaceDropzone);
    await dragPaletteBlock(page, 'move', '[data-testid="slot-do-dropzone"]');

    await dragWorkspaceBlock(page, 'move', workspaceDropzone);

    const slot = page.getByTestId('slot-do-dropzone');
    await expect(slot.locator('.slot-placeholder')).toHaveCount(1);
    await expect(page.locator(`${workspaceDropzone} .block`)).toHaveCount(2);
    await expect(page.locator(`${workspaceDropzone} [data-testid="block-move"]`)).toHaveCount(1);
  });
});
