import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import InventoryInspector from '../InventoryInspector';
import inventoryStyles from '../../../styles/InventoryInspector.module.css';
import { EntityOverlayManagerProvider, useEntityOverlayManager } from '../../../state/EntityOverlayManager';
import { DragProvider, useDragContext } from '../../../state/DragContext';
import type { EntityOverlayData } from '../../../types/overlay';
import type { SlotSchema } from '../../../types/slots';
import type { DragSession, DropTarget } from '../../../types/drag';
import type { EntityId } from '../../../simulation/ecs/world';

const createSlot = (
  id: string,
  index: number,
  occupantId: string | null,
  stackCount?: number,
  options?: { stackable?: boolean; locked?: boolean },
): SlotSchema => ({
  id,
  index,
  occupantId,
  stackCount,
  metadata: {
    stackable: options?.stackable ?? true,
    moduleSubtype: undefined,
    locked: options?.locked ?? false,
  },
});

const createEntity = (
  slots: SlotSchema[],
  options?: { chassisSlots?: SlotSchema[] },
): EntityOverlayData => ({
  entityId: 84 as EntityId,
  name: 'Test Robot',
  description: 'Prototype inventory unit',
  overlayType: 'complex',
  chassis: {
    capacity: options?.chassisSlots ? options.chassisSlots.length : 0,
    slots: options?.chassisSlots ?? [],
  },
  inventory: {
    capacity: slots.length,
    slots,
  },
});

const dropTargets = new Map<string, DropTarget>();
let managerApi: ReturnType<typeof useEntityOverlayManager> | null = null;

const waitForDropTarget = async (targetId: string): Promise<DropTarget> => {
  await waitFor(() => {
    if (!dropTargets.has(targetId)) {
      throw new Error(`Drop target ${targetId} not yet registered`);
    }
  });
  return dropTargets.get(targetId)!;
};

const createInventorySession = (
  entity: EntityOverlayData,
  sourceSlotId: string,
  itemId: string,
  stackCount = 1,
): DragSession => ({
  source: {
    type: 'inventory-slot',
    id: sourceSlotId,
    entityId: entity.entityId,
    slotId: sourceSlotId,
  },
  payload: {
    id: itemId,
    itemType: 'inventory-item',
    stackCount,
  },
});

const DragController = (): null => {
  const api = useDragContext();
  useEffect(() => {
    const originalRegister = api.registerDropTarget;
    api.registerDropTarget = (target) => {
      dropTargets.set(target.id, target);
      return originalRegister(target);
    };
    return () => {
      api.registerDropTarget = originalRegister;
      dropTargets.clear();
    };
  }, [api]);
  return null;
};

const ManagerCapture = (): null => {
  managerApi = useEntityOverlayManager();
  return null;
};

const renderInspector = (
  entity: EntityOverlayData,
  options?: { isLoading?: boolean },
) =>
  render(
    <EntityOverlayManagerProvider>
      <DragProvider>
        <ManagerCapture />
        <DragController />
        <InventoryInspector
          entity={entity}
          onClose={() => {}}
          isLoading={options?.isLoading ?? false}
          persistenceState={{ status: 'idle', error: null }}
        />
      </DragProvider>
    </EntityOverlayManagerProvider>,
  );

afterEach(() => {
  cleanup();
  dropTargets.clear();
  managerApi = null;
});

describe('InventoryInspector', () => {
  it('renders inventory slots with stack counts and module details', async () => {
    const slots = [
      createSlot('cargo-0', 0, 'resource.scrap', 12),
      createSlot('cargo-1', 1, 'core.movement', undefined, { stackable: false }),
      createSlot('cargo-2', 2, null),
    ];
    const entity = createEntity(slots);

    renderInspector(entity);

    expect(await screen.findByTestId('inventory-inspector')).toBeInTheDocument();
    expect(screen.getByText('Inventory Management')).toBeInTheDocument();

    const scrapSlot = screen.getByTestId('inventory-slot-cargo-0');
    expect(within(scrapSlot).getByText('Scrap')).toBeInTheDocument();
    expect(within(scrapSlot).getByText('×12')).toBeInTheDocument();

    const moduleSlot = screen.getByTestId('inventory-slot-cargo-1');
    expect(within(moduleSlot).getByText('Locomotion Thrusters Mk1')).toBeInTheDocument();
  });

  it('swaps items when dragging between occupied slots', async () => {
    const slots = [
      createSlot('cargo-0', 0, 'resource.scrap', 5),
      createSlot('cargo-1', 1, 'resource.ore', 3),
    ];
    const entity = createEntity(slots);

    renderInspector(entity);

    const targetId = `inventory-slot-${entity.entityId}-cargo-1`;
    const target = await waitForDropTarget(targetId);
    const session = createInventorySession(entity, 'cargo-0', 'resource.scrap', 5);
    const validation = target.accepts(session);
    expect(validation.canDrop).toBe(true);

    act(() => {
      target.onDrop(session, {
        target,
        snapPosition: null,
        pointerPosition: null,
        validation,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('inventory-slot-cargo-0')).toHaveTextContent('Ore');
      expect(screen.getByTestId('inventory-slot-cargo-1')).toHaveTextContent('Scrap');
    });
  });

  it('merges stackable items when dropped onto a matching slot', async () => {
    const slots = [
      createSlot('cargo-0', 0, 'resource.scrap', 5),
      createSlot('cargo-1', 1, 'resource.scrap', 3),
    ];
    const entity = createEntity(slots);

    renderInspector(entity);

    const targetId = `inventory-slot-${entity.entityId}-cargo-1`;
    const target = await waitForDropTarget(targetId);
    const session = createInventorySession(entity, 'cargo-0', 'resource.scrap', 5);
    const validation = target.accepts(session);
    expect(validation.canDrop).toBe(true);

    act(() => {
      target.onDrop(session, {
        target,
        snapPosition: null,
        pointerPosition: null,
        validation,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('inventory-slot-cargo-0')).toHaveTextContent('Empty slot');
      const mergedSlot = screen.getByTestId('inventory-slot-cargo-1');
      expect(within(mergedSlot).getByText('×8')).toBeInTheDocument();
    });
  });

  it('moves modules from chassis into inventory slots', async () => {
    const inventorySlots = [
      createSlot('cargo-0', 0, null),
      createSlot('cargo-1', 1, null),
    ];
    const chassisSlots = [createSlot('core-0', 0, 'core.movement')];
    const entity = createEntity(inventorySlots, { chassisSlots });

    renderInspector(entity);

    const targetId = `inventory-slot-${entity.entityId}-cargo-0`;
    const target = await waitForDropTarget(targetId);
    const session: DragSession = {
      source: {
        type: 'chassis-slot',
        id: 'core-0',
        entityId: entity.entityId,
        slotId: 'core-0',
      },
      payload: {
        id: 'core.movement',
        itemType: 'module',
      },
    };
    const validation = target.accepts(session);
    expect(validation.canDrop).toBe(true);

    act(() => {
      target.onDrop(session, {
        target,
        snapPosition: null,
        pointerPosition: null,
        validation,
      });
    });

    await waitFor(() => {
      const slot = screen.getByTestId('inventory-slot-cargo-0');
      expect(within(slot).getByText('Locomotion Thrusters Mk1')).toBeInTheDocument();
    });

    await waitFor(() => {
      const updated = managerApi?.getEntityData(entity.entityId);
      expect(updated?.chassis?.slots.find((slot) => slot.id === 'core-0')?.occupantId).toBeNull();
    });
  });

  it('swaps modules between chassis and inventory when dropping onto an occupied slot', async () => {
    const inventorySlots = [
      createSlot('cargo-0', 0, 'arm.manipulator'),
      createSlot('cargo-1', 1, null),
    ];
    const chassisSlots = [createSlot('core-0', 0, 'core.movement')];
    const entity = createEntity(inventorySlots, { chassisSlots });

    renderInspector(entity);

    const targetId = `inventory-slot-${entity.entityId}-cargo-0`;
    const target = await waitForDropTarget(targetId);
    const session: DragSession = {
      source: {
        type: 'chassis-slot',
        id: 'core-0',
        entityId: entity.entityId,
        slotId: 'core-0',
      },
      payload: {
        id: 'core.movement',
        itemType: 'module',
      },
    };
    const validation = target.accepts(session);
    expect(validation.canDrop).toBe(true);

    act(() => {
      target.onDrop(session, {
        target,
        snapPosition: null,
        pointerPosition: null,
        validation,
      });
    });

    await waitFor(() => {
      const slot = screen.getByTestId('inventory-slot-cargo-0');
      expect(within(slot).getByText('Locomotion Thrusters Mk1')).toBeInTheDocument();
    });

    await waitFor(() => {
      const updated = managerApi?.getEntityData(entity.entityId);
      expect(updated?.chassis?.slots.find((slot) => slot.id === 'core-0')?.occupantId).toBe('arm.manipulator');
    });
  });

  it('rejects chassis drops onto inventory slots with non-module items', async () => {
    const inventorySlots = [
      createSlot('cargo-0', 0, 'resource.scrap', 4),
      createSlot('cargo-1', 1, null),
    ];
    const chassisSlots = [createSlot('core-0', 0, 'core.movement')];
    const entity = createEntity(inventorySlots, { chassisSlots });

    renderInspector(entity);

    const targetId = `inventory-slot-${entity.entityId}-cargo-0`;
    const target = await waitForDropTarget(targetId);
    const session: DragSession = {
      source: {
        type: 'chassis-slot',
        id: 'core-0',
        entityId: entity.entityId,
        slotId: 'core-0',
      },
      payload: {
        id: 'core.movement',
        itemType: 'module',
      },
    };

    const validation = target.accepts(session);
    expect(validation.canDrop).toBe(false);
    expect(validation.reason).toBe('incompatible-item');
  });

  it('renders skeleton state with loading classes when requested', async () => {
    const entity = createEntity([
      createSlot('cargo-0', 0, null),
      createSlot('cargo-1', 1, null),
    ]);

    renderInspector(entity, { isLoading: true });

    const inspector = await screen.findByTestId('inventory-inspector');
    expect(inspector).toHaveAttribute('data-loading', 'true');
    expect(inspector.className.split(' ')).toContain(inventoryStyles.loading);
  });

  it('exposes accessible labels for empty slots in the loaded state', async () => {
    const entity = createEntity([
      createSlot('cargo-0', 0, null),
      createSlot('cargo-1', 1, null),
    ]);

    renderInspector(entity);

    const emptyButton = await screen.findByRole('button', { name: /empty inventory slot 1/i });
    expect(emptyButton).toBeInTheDocument();
  });

  it('displays a placeholder when the entity lacks inventory data', () => {
    const entity: EntityOverlayData = {
      entityId: 99 as EntityId,
      name: 'No Inventory',
      description: 'Test entity without inventory',
      overlayType: 'complex',
      chassis: undefined,
      inventory: undefined,
    };

    render(
      <EntityOverlayManagerProvider>
        <DragProvider>
          <InventoryInspector
            entity={entity}
            onClose={() => {}}
            isLoading={false}
            persistenceState={{ status: 'idle', error: null }}
          />
        </DragProvider>
      </EntityOverlayManagerProvider>,
    );

    expect(screen.getByText(/inventory data is not available/i)).toBeInTheDocument();
  });
});
