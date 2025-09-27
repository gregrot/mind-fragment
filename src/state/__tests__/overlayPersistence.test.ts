import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultOverlayPersistenceAdapter } from '../overlayPersistence';
import { simulationRuntime } from '../simulationRuntime';
import { chassisState, inventoryState, telemetryState } from '../runtime';
import { MechanismChassis, createModuleInstance } from '../../simulation/mechanism';
import type { MechanismOverlayUpdate, RootScene } from '../../simulation/rootScene';
import { reconcileMechanismOverlayState } from '../../simulation/rootScene';
import { DEFAULT_MECHANISM_ID } from '../../simulation/runtime/simulationWorld';
import type { EntityOverlayData } from '../../types/overlay';
import type { EntityId } from '../../simulation/ecs/world';

const createMechanismScene = () => {
  const mechanism = new MechanismChassis();
  mechanism.attachModule(createModuleInstance('core.movement'));
  mechanism.attachModule(createModuleInstance('storage.cargo'));
  mechanism.attachModule(createModuleInstance('arm.manipulator'));

  const inventory = mechanism.inventory;
  let selectedMechanismId: string | null = DEFAULT_MECHANISM_ID;

  const scene = {
    mechanism,
    subscribeProgramStatus: vi.fn(() => () => {}),
    runProgram: vi.fn(),
    stopProgram: vi.fn(),
    getInventorySnapshot: vi.fn(() => inventory.getSnapshot()),
    subscribeInventory: vi.fn((listener: (snapshot: ReturnType<typeof inventory.getSnapshot>) => void) => {
      return inventory.subscribe(listener);
    }),
    subscribeTelemetry: vi.fn((listener: (snapshot: unknown, mechanismId: string | null) => void) => {
      listener({ values: {}, actions: {} }, DEFAULT_MECHANISM_ID);
      return () => {};
    }),
    getTelemetrySnapshot: vi.fn(() => ({ values: {}, actions: {} })),
    subscribeProgramDebug: vi.fn((listener: (state: unknown, mechanismId: string) => void) => {
      listener({ status: 'idle', program: null, currentInstruction: null, timeRemaining: 0, frames: [] }, DEFAULT_MECHANISM_ID);
      return () => {};
    }),
    getProgramDebugState: vi.fn(() => ({ status: 'idle', program: null, currentInstruction: null, timeRemaining: 0, frames: [] })),
    subscribeChassis: vi.fn((listener: (snapshot: ReturnType<MechanismChassis['getSlotSchemaSnapshot']>) => void) => {
      return mechanism.subscribeSlots(listener);
    }),
    getChassisSnapshot: vi.fn(() => mechanism.getSlotSchemaSnapshot()),
    getSelectedMechanism: vi.fn(() => selectedMechanismId),
    selectMechanism: vi.fn((mechanismId: string) => {
      selectedMechanismId = mechanismId;
    }),
    clearMechanismSelection: vi.fn(() => {
      selectedMechanismId = null;
    }),
    reconcileMechanismOverlay: vi.fn((mechanismId: string, overlay: MechanismOverlayUpdate) => {
      if (mechanismId !== DEFAULT_MECHANISM_ID) {
        return;
      }
      reconcileMechanismOverlayState(mechanism, overlay);
    }),
  } as unknown as RootScene & {
    mechanism: MechanismChassis;
  };

  return scene;
};

describe('overlay persistence integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    simulationRuntime.stopProgram(DEFAULT_MECHANISM_ID);
    simulationRuntime.clearSelectedMechanism();
    inventoryState.clear();
    chassisState.clear();
    telemetryState.clear();
  });

  it('persists chassis modules moved into inventory across scene snapshots', async () => {
    const scene = createMechanismScene();
    simulationRuntime.registerScene(scene);

    const manipulatorSnapshot = scene.mechanism.getSlotSchemaSnapshot();
    const manipulatorSlot = manipulatorSnapshot.slots.find((slot) => slot.occupantId === 'arm.manipulator');
    expect(manipulatorSlot).toBeTruthy();

    const inventorySnapshot = scene.mechanism.inventory.getSlotSchemaSnapshot();
    expect(inventorySnapshot.slots[0]).toBeTruthy();

    const entityId: EntityId = 1 as EntityId;

    const previous: EntityOverlayData = {
      entityId,
      mechanismId: DEFAULT_MECHANISM_ID,
      name: 'Test Mechanism',
      overlayType: 'complex',
      chassis: {
        capacity: manipulatorSnapshot.capacity,
        slots: manipulatorSnapshot.slots.map((slot) => ({ ...slot, metadata: { ...slot.metadata } })),
      },
      inventory: {
        capacity: inventorySnapshot.capacity,
        slots: inventorySnapshot.slots.map((slot) => ({ ...slot, metadata: { ...slot.metadata } })),
      },
    };

    const next: EntityOverlayData = {
      ...previous,
      chassis: {
        capacity: manipulatorSnapshot.capacity,
        slots: manipulatorSnapshot.slots.map((slot) =>
          slot.id === manipulatorSlot?.id
            ? { ...slot, occupantId: null, metadata: { ...slot.metadata } }
            : { ...slot, metadata: { ...slot.metadata } },
        ),
      },
      inventory: {
        capacity: inventorySnapshot.capacity,
        slots: inventorySnapshot.slots.map((slot, index) =>
          index === 0
            ? {
                ...slot,
                occupantId: 'arm.manipulator',
                stackCount: undefined,
                metadata: { ...slot.metadata, stackable: false },
              }
            : { ...slot, metadata: { ...slot.metadata } },
        ),
      },
    };

    const adapter = getDefaultOverlayPersistenceAdapter();
    await adapter.saveEntity(next, previous);

    expect(scene.reconcileMechanismOverlay).toHaveBeenCalledWith(
      DEFAULT_MECHANISM_ID,
      expect.objectContaining({
        chassis: expect.objectContaining({ slots: expect.any(Array) }),
        inventory: expect.objectContaining({ slots: expect.any(Array) }),
      }),
    );

    const chassisAfter = scene.mechanism.getSlotSchemaSnapshot();
    const updatedManipulatorSlot = chassisAfter.slots.find((slot) => slot.id === manipulatorSlot?.id);
    expect(updatedManipulatorSlot?.occupantId).toBeNull();

    const inventoryAfter = scene.mechanism.inventory.getSnapshot();
    const storedModuleSlot = inventoryAfter.slots.find((slot) => slot.occupantId === 'arm.manipulator');
    expect(storedModuleSlot).toBeTruthy();

    simulationRuntime.unregisterScene(scene);
  });
});

