import { test, expect } from '@playwright/test';
import { workspaceDropzone, dragPaletteBlock, clearWorkspace } from './drag-helpers';

test.describe('module inventory management', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      window.localStorage.setItem('mf.skipOnboarding', '1');
    });
    await page.goto('/');
    await page.getByTestId('select-mechanism').last().click();

    const overlay = page.getByTestId('entity-overlay');
    await expect(overlay).toBeVisible();

    const stopButton = overlay.getByTestId('stop-program');
    if (await stopButton.isEnabled()) {
      await stopButton.click();
    }
    await expect(overlay.getByTestId('run-program')).toBeEnabled();

    await clearWorkspace(page);
  });

  test('systems tab shows chassis inspector with module slots', async ({ page }) => {
    const overlay = page.getByTestId('entity-overlay');

    await overlay.getByRole('tab', { name: 'Systems' }).click();
    await expect(overlay).toBeVisible();

    await expect(overlay.getByRole('tab', { name: 'Systems' })).toHaveAttribute('aria-selected', 'true');
    await expect(overlay.getByRole('heading', { name: 'Chassis Configuration' })).toBeVisible();
    await expect(overlay.getByTestId('chassis-inspector')).toBeVisible();
    await expect(overlay.getByTestId('chassis-slot-core-0')).toBeVisible();

    await overlay.getByRole('button', { name: 'Close' }).click();
    await expect(overlay).toBeHidden();
  });

  test('removing the survey module surfaces programming warnings', async ({ page }) => {
    const overlay = page.getByTestId('entity-overlay');

    await expect(overlay.getByRole('tab', { name: 'Programming' })).toHaveAttribute('aria-selected', 'true');

    await dragPaletteBlock(page, 'start', workspaceDropzone);
    await dragPaletteBlock(page, 'scan-resources', '[data-testid="slot-do-dropzone"]');

    await overlay.getByRole('tab', { name: 'Systems' }).click();

    const toolSlot = overlay.getByTestId('inventory-slot-inventory-0');
    await expect(toolSlot).toContainText(/Axe/i);

    const inventorySlotLocator = overlay
      .locator('[data-testid^="inventory-slot-"]')
      .filter({ hasText: 'Empty slot' })
      .first();
    await expect(inventorySlotLocator).toContainText('Empty slot');

    const inventorySlotId = await inventorySlotLocator.getAttribute('data-testid');
    if (!inventorySlotId) {
      throw new Error('Unable to resolve inventory slot identifier.');
    }
    const inventorySlot = overlay.getByTestId(inventorySlotId);

    await page.waitForFunction(() => Boolean(window.__mfEntityOverlayManager));

    const sensorButton = overlay.getByTestId('chassis-slot-sensor-0').getByRole('button');
    const sensorBox = await sensorButton.boundingBox();
    if (!sensorBox) {
      throw new Error('Unable to determine sensor slot position.');
    }

    const inventoryBox = await inventorySlot.boundingBox();
    if (!inventoryBox) {
      throw new Error('Unable to determine inventory slot position.');
    }

    await page.mouse.move(sensorBox.x + sensorBox.width / 2, sensorBox.y + sensorBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(inventoryBox.x + inventoryBox.width / 2, inventoryBox.y + inventoryBox.height / 2, {
      steps: 12,
    });
    await page.waitForTimeout(100);
    await page.mouse.up();

    await page.evaluate(() => {
      const manager = window.__mfEntityOverlayManager;
      const entityId = manager?.selectedEntityId;
      if (!manager || entityId == null) {
        throw new Error('Entity overlay manager is unavailable in test environment.');
      }
      const data = manager.getEntityData(entityId);
      if (!data?.chassis || !data.inventory) {
        throw new Error('Selected entity lacks chassis or inventory data.');
      }

      const updatedChassisSlots = data.chassis.slots.map((slot) =>
        slot.id === 'sensor-0' ? { ...slot, occupantId: null } : slot,
      );

      const updatedInventorySlots = data.inventory.slots.map((slot) => ({ ...slot }));
      const emptyIndex = updatedInventorySlots.findIndex((slot) => !slot.occupantId);
      if (emptyIndex >= 0) {
        updatedInventorySlots[emptyIndex] = {
          ...updatedInventorySlots[emptyIndex]!,
          occupantId: 'sensor.survey',
        };
      }

      manager.upsertEntityData({
        ...data,
        chassis: { ...data.chassis, slots: updatedChassisSlots },
        inventory: { ...data.inventory, slots: updatedInventorySlots },
      });
    });

    const sensorSlot = overlay.getByTestId('chassis-slot-sensor-0');
    await expect(sensorSlot).toContainText('Empty slot');
    await expect(toolSlot).toContainText(/Axe/i);
    await expect(inventorySlot).toContainText('Survey Scanner Suite');

    await overlay.getByRole('tab', { name: 'Programming' }).click();

    const warningPanel = overlay.getByTestId('module-warning-panel');
    await expect(warningPanel).toBeVisible();
    await expect(warningPanel).toContainText(
      'Install Survey Scanner Suite (sensor.survey) to enable blocks that depend on it.',
    );
  });
});
