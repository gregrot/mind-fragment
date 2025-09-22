import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import SimulationOverlay, { type OverlayTab } from '../SimulationOverlay';
import type { WorkspaceState } from '../../types/blocks';

vi.mock('../InventoryStatus', () => ({
  default: () => <div>Inventory Mock</div>,
}));

vi.mock('../ModuleInventory', () => ({
  default: () => <div>Catalogue Mock</div>,
}));

vi.mock('../RobotProgrammingPanel', () => ({
  default: () => <div>Programming Mock</div>,
}));

describe('SimulationOverlay panels', () => {
  const mockProps = {
    onTabChange: vi.fn(),
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    workspace: [] as WorkspaceState,
    onDrop: vi.fn(),
    onUpdateBlock: vi.fn(),
    robotId: 'MF-01',
  } as const;

  const renderOverlay = (tab: OverlayTab) =>
    render(
      <SimulationOverlay
        isOpen
        activeTab={tab}
        {...mockProps}
      />,
    );

  it('only displays the inventory panel when inventory is active', () => {
    const { container } = renderOverlay('inventory');

    const inventory = container.querySelector('#simulation-overlay-panel-inventory');
    const catalog = container.querySelector('#simulation-overlay-panel-catalog');
    const programming = container.querySelector('#simulation-overlay-panel-programming');

    expect(inventory).not.toBeNull();
    expect(catalog).not.toBeNull();
    expect(programming).not.toBeNull();
    expect(inventory).toBeVisible();
    expect(catalog).not.toBeVisible();
    expect(programming).not.toBeVisible();
  });

  it('only displays the catalogue panel when catalogue is active', () => {
    const { container } = renderOverlay('catalog');

    const inventory = container.querySelector('#simulation-overlay-panel-inventory');
    const catalog = container.querySelector('#simulation-overlay-panel-catalog');
    const programming = container.querySelector('#simulation-overlay-panel-programming');

    expect(inventory).not.toBeNull();
    expect(catalog).not.toBeNull();
    expect(programming).not.toBeNull();
    expect(inventory).not.toBeVisible();
    expect(catalog).toBeVisible();
    expect(programming).not.toBeVisible();
  });

  it('only displays the programming panel when programming is active', () => {
    const { container } = renderOverlay('programming');

    const inventory = container.querySelector('#simulation-overlay-panel-inventory');
    const catalog = container.querySelector('#simulation-overlay-panel-catalog');
    const programming = container.querySelector('#simulation-overlay-panel-programming');

    expect(inventory).not.toBeNull();
    expect(catalog).not.toBeNull();
    expect(programming).not.toBeNull();
    expect(inventory).not.toBeVisible();
    expect(catalog).not.toBeVisible();
    expect(programming).toBeVisible();
  });
});
