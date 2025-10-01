import { test, expect } from '@playwright/test';
import { workspaceDropzone, dragPaletteBlock, clearWorkspace } from './drag-helpers';

const TREE_ID = 'playwright-tree-harvest';

test.describe('resource scanning and gathering', () => {
  test.setTimeout(60_000);

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
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

    await page.waitForFunction(() => {
      const runtime = window.__mfSimulationRuntime;
      return Boolean(runtime && runtime.getResourceFieldSnapshot('MF-01').length > 0);
    });

    await clearWorkspace(page);
  });

  test('player can automate chopping a tree for logs with the primary tool slot', async ({ page }) => {
    const overlay = page.getByTestId('entity-overlay');

    await page.evaluate(async (treeId) => {
      const runtime = window.__mfSimulationRuntime;
      if (!runtime) {
        throw new Error('Simulation runtime is not available.');
      }
      const existingNodes = runtime.getResourceFieldSnapshot('MF-01');
      for (const node of existingNodes) {
        await runtime.removeResourceNode('MF-01', node.id);
      }
      await runtime.upsertResourceNode('MF-01', {
        id: treeId,
        type: 'tree',
        position: { x: 48, y: 0 },
        quantity: 3,
        metadata: {
          hitPoints: 3,
          hitsRemaining: 3,
          requiredTool: 'axe',
          drop: { type: 'log', quantity: 2 },
        },
      });
    }, TREE_ID);

    const initialLogCount = await page.evaluate(() => {
      const runtime = window.__mfSimulationRuntime;
      if (!runtime) {
        throw new Error('Simulation runtime is not available.');
      }
      return runtime.getResourceFieldSnapshot('MF-01').filter((node) => node.type === 'log').length;
    });
    expect(initialLogCount).toBe(0);

    await dragPaletteBlock(page, 'start', workspaceDropzone);
    await dragPaletteBlock(page, 'forever', '[data-testid="block-start"] [data-testid="slot-do-dropzone"]');

    const loopDropzone = '[data-testid="block-forever"] [data-testid="slot-do-dropzone"]';
    await dragPaletteBlock(page, 'scan-resources', loopDropzone);
    await dragPaletteBlock(page, 'move-to', loopDropzone);
    const moveTargetX = page.getByTestId('block-move-to-parameter-targetX');
    await moveTargetX.fill('48');
    await moveTargetX.blur();
    const moveTargetY = page.getByTestId('block-move-to-parameter-targetY');
    await moveTargetY.fill('0');
    await moveTargetY.blur();
    await dragPaletteBlock(page, 'use-item-slot', loopDropzone);
    const toolSlotInput = page.getByTestId('block-use-item-slot-parameter-slotIndex');
    await toolSlotInput.fill('1');
    await toolSlotInput.blur();
    const toolTargetX = page.getByTestId('block-use-item-slot-parameter-targetX');
    await toolTargetX.fill('48');
    await toolTargetX.blur();
    const toolTargetY = page.getByTestId('block-use-item-slot-parameter-targetY');
    await toolTargetY.fill('0');
    await toolTargetY.blur();
    await dragPaletteBlock(page, 'gather-resource', loopDropzone);
    await dragPaletteBlock(page, 'wait', loopDropzone);

    await page.getByTestId('run-program').click();

    await page.waitForFunction(
      (treeId) => {
        const runtime = window.__mfSimulationRuntime;
        if (!runtime) {
          return false;
        }
        const nodes = runtime.getResourceFieldSnapshot('MF-01');
        const tree = nodes.find((node) => node.id === treeId);
        const logNode = nodes.find((node) => node.type === 'log');
        const treeGone = !tree || tree.quantity <= 0;
        return Boolean(treeGone && logNode);
      },
      TREE_ID,
      { timeout: 35_000 },
    );

    await page.waitForFunction(
      () => {
        const runtime = window.__mfSimulationRuntime;
        if (!runtime) {
          return false;
        }
        const inventory = runtime.getInventorySnapshot();
        const entries = Array.isArray(inventory.entries) ? inventory.entries : [];
        const logEntry = entries.find((entry) => entry.resource === 'log');
        return Boolean(logEntry && logEntry.quantity >= 2);
      },
      undefined,
      { timeout: 20_000 },
    );

    const finalSnapshot = await page.evaluate((treeId) => {
      const runtime = window.__mfSimulationRuntime;
      if (!runtime) {
        throw new Error('Simulation helpers are unavailable.');
      }
      const nodes = runtime.getResourceFieldSnapshot('MF-01');
      const tree = nodes.find((node) => node.id === treeId);
      const logNodes = nodes.filter((node) => node.type === 'log');
      const inventory = runtime.getInventorySnapshot();
      const entries = Array.isArray(inventory.entries) ? inventory.entries : [];
      return {
        treeNode: tree ? { id: tree.id, quantity: tree.quantity } : null,
        logNodes: logNodes.map((node) => ({
          id: node.id,
          quantity: node.quantity,
          position: node.position,
        })),
        inventoryEntries: entries,
      };
    }, TREE_ID);

    expect(finalSnapshot.treeNode === null || finalSnapshot.treeNode.quantity <= 0).toBe(true);
    expect(finalSnapshot.logNodes.length).toBeGreaterThanOrEqual(1);
    expect(finalSnapshot.inventoryEntries).toContainEqual(
      expect.objectContaining({ resource: 'log', quantity: 2 }),
    );

    await overlay.getByTestId('stop-program').click();
  });
});
