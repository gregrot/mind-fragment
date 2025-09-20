import { test, expect } from '@playwright/test';

test('module catalogue lists installed modules with hooks and telemetry', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Catalogue' }).click();
  await expect(page.getByTestId('robot-programming-overlay')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Module Catalogue' })).toBeVisible();

  const moduleIds = ['core.movement', 'arm.manipulator', 'fabricator.basic', 'sensor.survey'];
  for (const moduleId of moduleIds) {
    const card = page.getByTestId(`module-card-${moduleId}`);
    await expect(card).toBeVisible();
    await expect(card.getByText('Installed')).toBeVisible();
    await expect(card.getByText('Parameters')).toBeVisible();
    await expect(card.getByText('Block Hooks')).toBeVisible();
    await expect(card.getByText('Telemetry')).toBeVisible();
  }

  const movementCard = page.getByTestId('module-card-core.movement');
  await expect(movementCard.getByText('Set linear velocity')).toBeVisible();
  await expect(movementCard.getByText('Distance travelled')).toBeVisible();

  const manipulatorCard = page.getByTestId('module-card-arm.manipulator');
  await expect(manipulatorCard.getByText('Grip target')).toBeVisible();
  await expect(manipulatorCard.getByText('Held item', { exact: true })).toBeVisible();

  const fabricatorCard = page.getByTestId('module-card-fabricator.basic');
  await expect(fabricatorCard.getByText('Queue recipe')).toBeVisible();
  await expect(fabricatorCard.getByText('Last completed')).toBeVisible();

  const scannerCard = page.getByTestId('module-card-sensor.survey');
  await expect(scannerCard.getByText('Sweep area')).toBeVisible();
  await expect(scannerCard.getByText('Cooldown remaining')).toBeVisible();
});
