import { test, expect } from '@playwright/test';
import {
  workspaceDropzone,
  dragPaletteBlock,
  dragWorkspaceBlock,
  clearWorkspace,
} from './drag-helpers';

test.describe('block workspace drag-and-drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.addInitScript(() => {
      window.localStorage.setItem('mf.skipOnboarding', '1');
    });
    await page.goto('/');
    await page.getByTestId('select-mechanism').last().click();
    await expect(page.getByTestId('entity-overlay')).toBeVisible();

    const stopButton = page.getByTestId('stop-program');
    if (await stopButton.isEnabled()) {
      await stopButton.click();
      await expect(page.getByTestId('run-program')).toBeEnabled();
    }

    await clearWorkspace(page);
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

  test('edits literals, drops operators, and selects signals inside the workspace', async ({ page }) => {
    await dragPaletteBlock(page, 'start', workspaceDropzone);
    await expect(page.getByTestId('block-start')).toHaveCount(1);

    await dragPaletteBlock(
      page,
      'repeat',
      '[data-testid="block-start"] [data-testid="slot-do-dropzone"]',
    );
    const repeatBlock = page.locator('[data-testid="block-repeat"]').last();
    await expect(repeatBlock).toBeVisible();

    await dragPaletteBlock(
      page,
      'move',
      '[data-testid="block-repeat"] [data-testid="slot-do-dropzone"]',
    );
    await expect(repeatBlock.locator('[data-testid="block-move"]').last()).toBeVisible();

    await dragPaletteBlock(
      page,
      'operator-add',
      '[data-testid="block-repeat"] [data-testid="block-repeat-parameter-count-expression-dropzone"]',
    );

    const operatorBlock = page.locator('[data-testid="block-operator-add"]').last();
    await expect(operatorBlock).toBeVisible();
    const operatorInputs = operatorBlock.locator('input[type="number"]');
    await operatorInputs.first().fill('4');
    await operatorInputs.nth(1).fill('2');
    await expect(operatorInputs.first()).toHaveValue('4');
    await expect(operatorInputs.nth(1)).toHaveValue('2');

    await dragPaletteBlock(
      page,
      'broadcast-signal',
      '[data-testid="block-start"] [data-testid="slot-do-dropzone"]',
    );

    const broadcastBlock = page.locator('[data-testid="block-broadcast-signal"]').last();
    await expect(broadcastBlock).toBeVisible();
    const signalSelect = broadcastBlock.locator('[data-testid="block-broadcast-signal-parameter-signal"]');
    await signalSelect.selectOption('alert.signal');
    await expect(signalSelect).toHaveValue('alert.signal');
  });

  test('provides a scrollable block palette so later blocks are reachable', async ({ page }) => {
    const layout = page.getByTestId('programming-layout');
    const palette = page.getByTestId('block-palette-list');

    await expect(palette).toBeVisible();

    const paletteOverflow = (await palette.evaluate((element) =>
      getComputedStyle(element).overflowY,
    )) as string;
    expect(paletteOverflow).toBe('auto');

    await page
      .locator('#simulation-overlay-panel-programming')
      .evaluate((element) => {
        (element as HTMLElement).style.setProperty('height', '420px', 'important');
      });

    await layout.evaluate((element) => {
      (element as HTMLElement).style.setProperty('height', '100%', 'important');
    });

    await expect
      .poll(async () =>
        palette.evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeGreaterThan(0);

    await palette.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    await expect
      .poll(async () => palette.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    await expect(page.getByTestId('palette-if')).toBeVisible();
  });
});
