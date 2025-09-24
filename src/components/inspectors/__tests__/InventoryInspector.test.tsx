import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import InventoryInspector from '../InventoryInspector';
import { EntityOverlayManagerProvider } from '../../../state/EntityOverlayManager';
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

const createEntity = (slots: SlotSchema[]): EntityOverlayData => ({
  entityId: 84 as EntityId,
  name: 'Test Robot',
  description: 'Prototype inventory unit',
  overlayType: 'complex',
  chassis: {
    capacity: 0,
    slots: [],
  },
  inventory: {
    capacity: slots.length,
    slots,
  },
});

const dropTargets = new Map<string, DropTarget>();

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

const renderInspector = (entity: EntityOverlayData) =>
  render(
    <EntityOverlayManagerProvider>
      <DragProvider>
        <DragController />
        <InventoryInspector entity={entity} onClose={() => {}} />
      </DragProvider>
    </EntityOverlayManagerProvider>,
  );

afterEach(() => {
  cleanup();
  dropTargets.clear();
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
});
