import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ChassisInspector from '../ChassisInspector';
import { EntityOverlayManagerProvider } from '../../../state/EntityOverlayManager';
import { DragProvider, useDragContext } from '../../../state/DragContext';
import type { EntityOverlayData, SlotSchema } from '../../../types/overlay';
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

const createEntity = (slots: SlotSchema[]): EntityOverlayData => ({
  entityId: 42 as EntityId,
  name: 'Test Robot',
  description: 'Prototype exploration unit',
  overlayType: 'complex',
  chassis: {
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

const renderInspector = (entity: EntityOverlayData) =>
  render(
    <EntityOverlayManagerProvider>
      <DragProvider>
        <DragController />
        <ChassisInspector entity={entity} onClose={() => {}} />
      </DragProvider>
    </EntityOverlayManagerProvider>,
  );

afterEach(() => {
  cleanup();
  dropTargets.clear();
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
});
