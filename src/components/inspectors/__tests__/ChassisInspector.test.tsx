import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChassisInspector from '../ChassisInspector';
import chassisStyles from '../../../styles/ChassisInspector.module.css';
import { EntityOverlayManagerProvider, useEntityOverlayManager } from '../../../state/EntityOverlayManager';
import { DragProvider, useDragContext } from '../../../state/DragContext';
import type { EntityOverlayData } from '../../../types/overlay';
import type { SlotSchema } from '../../../types/slots';
import type { DragSession, DropTarget } from '../../../types/drag';
import type { EntityId } from '../../../simulation/ecs/world';
import { useEffect } from 'react';

const createSlot = (id: string, index: number, occupantId: string | null): SlotSchema => ({
  id,
  index,
  occupantId,
  metadata: {
    stackable: false,
    moduleSubtype: undefined,
    locked: false,
  },
});

const createEntity = (
  slots: SlotSchema[],
  options?: { inventorySlots?: SlotSchema[] },
): EntityOverlayData => ({
  entityId: 42 as EntityId,
  name: 'Test Robot',
  description: 'Prototype exploration unit',
  overlayType: 'complex',
  chassis: {
    capacity: slots.length,
    slots,
  },
  inventory: options?.inventorySlots
    ? { capacity: options.inventorySlots.length, slots: options.inventorySlots }
    : undefined,
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

const createModuleSession = (
  entity: EntityOverlayData,
  sourceSlotId: string,
  moduleId: string,
): DragSession => ({
  source: {
    type: 'chassis-slot',
    id: sourceSlotId,
    entityId: entity.entityId,
    slotId: sourceSlotId,
  },
  payload: {
    id: moduleId,
    itemType: 'module',
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
        <ChassisInspector
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

describe('ChassisInspector', () => {
  it('renders chassis slots with installed module information', async () => {
    const slots = [
      createSlot('core-0', 0, 'core.movement'),
      createSlot('extension-0', 1, 'arm.manipulator'),
      createSlot('utility-0', 2, null),
    ];
    const entity = createEntity(slots);

    renderInspector(entity);

    expect(await screen.findByTestId('chassis-inspector')).toBeInTheDocument();
    expect(screen.getByText('Chassis Configuration')).toBeInTheDocument();
    expect(screen.getByText('Locomotion Thrusters Mk1')).toBeInTheDocument();
    expect(screen.getByText('Precision Manipulator Rig')).toBeInTheDocument();
    const renderedSlots = screen.getAllByTestId(/chassis-slot-/);
    expect(renderedSlots).toHaveLength(3);
  });

  it('renders loading skeleton classes when the inspector is loading', async () => {
    const slots = [
      createSlot('core-0', 0, 'core.movement'),
      createSlot('extension-0', 1, null),
    ];
    const entity = createEntity(slots);

    renderInspector(entity, { isLoading: true });

    const inspector = await screen.findByTestId('chassis-inspector');
    expect(inspector).toHaveAttribute('data-loading', 'true');
    expect(inspector.className.split(' ')).toContain(chassisStyles.loading);
    expect(inspector).toHaveAttribute('aria-label', 'Chassis inspector');
  });

  it('displays module tooltips on hover', async () => {
    const slots = [
      createSlot('core-0', 0, 'core.movement'),
      createSlot('extension-0', 1, null),
      createSlot('utility-0', 2, null),
    ];
    const entity = createEntity(slots);

    renderInspector(entity);

    const coreSlot = await screen.findByTestId('chassis-slot-core-0');
    const movementButton = within(coreSlot).getByRole('button');
    fireEvent.mouseEnter(movementButton);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Locomotion Thrusters Mk1');
    expect(tooltip).toHaveTextContent('Provides: movement.linear, movement.angular');
  });

  it('swaps modules when dragging onto another occupied slot', async () => {
    const slots = [
      createSlot('core-0', 0, 'core.movement'),
      createSlot('extension-0', 1, 'arm.manipulator'),
      createSlot('utility-0', 2, null),
    ];
    const entity = createEntity(slots);

    renderInspector(entity);

    const targetId = `chassis-slot-${entity.entityId}-extension-0`;
    const target = await waitForDropTarget(targetId);
    const session = createModuleSession(entity, 'core-0', 'core.movement');
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
      expect(screen.getByTestId('chassis-slot-core-0')).toHaveTextContent('Precision Manipulator Rig');
      expect(screen.getByTestId('chassis-slot-extension-0')).toHaveTextContent('Locomotion Thrusters Mk1');
    });
  });

  it('moves modules into empty slots when dropped on an unoccupied slot', async () => {
    const slots = [
      createSlot('core-0', 0, 'core.movement'),
      createSlot('extension-0', 1, null),
      createSlot('utility-0', 2, null),
    ];
    const entity = createEntity(slots);

    renderInspector(entity);

    const targetId = `chassis-slot-${entity.entityId}-extension-0`;
    const target = await waitForDropTarget(targetId);
    const session = createModuleSession(entity, 'core-0', 'core.movement');
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
      expect(screen.getByTestId('chassis-slot-core-0')).not.toHaveTextContent('Locomotion Thrusters Mk1');
      expect(screen.getByTestId('chassis-slot-extension-0')).toHaveTextContent('Locomotion Thrusters Mk1');
    });
  });

  it('equips modules dragged from inventory and updates inventory state', async () => {
    const chassisSlots = [
      createSlot('core-0', 0, 'core.movement'),
      createSlot('extension-0', 1, null),
      createSlot('utility-0', 2, null),
    ];
    const inventorySlots = [
      createSlot('cargo-0', 0, 'arm.manipulator'),
      createSlot('cargo-1', 1, null),
    ];
    const entity = createEntity(chassisSlots, { inventorySlots });

    renderInspector(entity);

    const targetId = `chassis-slot-${entity.entityId}-extension-0`;
    const target = await waitForDropTarget(targetId);
    const session: DragSession = {
      source: {
        type: 'inventory-slot',
        id: 'cargo-0',
        entityId: entity.entityId,
        slotId: 'cargo-0',
      },
      payload: {
        id: 'arm.manipulator',
        itemType: 'inventory-item',
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
      expect(screen.getByTestId('chassis-slot-extension-0')).toHaveTextContent('Precision Manipulator Rig');
    });

    await waitFor(() => {
      const updated = managerApi?.getEntityData(entity.entityId);
      expect(updated?.inventory?.slots.find((slot) => slot.id === 'cargo-0')?.occupantId).toBeNull();
    });
  });

  it('rejects non-module inventory items when dragged onto chassis slots', async () => {
    const chassisSlots = [
      createSlot('core-0', 0, null),
      createSlot('extension-0', 1, null),
    ];
    const inventorySlots = [createSlot('cargo-0', 0, 'resource.scrap')];
    const entity = createEntity(chassisSlots, { inventorySlots });

    renderInspector(entity);

    const targetId = `chassis-slot-${entity.entityId}-core-0`;
    const target = await waitForDropTarget(targetId);
    const session: DragSession = {
      source: {
        type: 'inventory-slot',
        id: 'cargo-0',
        entityId: entity.entityId,
        slotId: 'cargo-0',
      },
      payload: {
        id: 'resource.scrap',
        itemType: 'inventory-item',
      },
    };

    const validation = target.accepts(session);
    expect(validation.canDrop).toBe(false);
    expect(validation.reason).toBe('module-required');
  });
});
