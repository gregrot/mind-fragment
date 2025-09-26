import { describe, expect, it, beforeEach, vi } from 'vitest';
import { simulationRuntime } from '../simulationRuntime';
import { DEFAULT_STARTUP_PROGRAM } from '../../simulation/runtime/defaultProgram';
import { DEFAULT_MECHANISM_ID } from '../../simulation/runtime/simulationWorld';
import { createNumberLiteralBinding, type CompiledProgram } from '../../simulation/runtime/blockProgram';
import type { RootScene } from '../../simulation/rootScene';
import type { ChassisSnapshot } from '../../simulation/mechanism';
import type { ProgramDebugState, ProgramRunnerStatus } from '../../simulation/runtime/blockProgramRunner';
import type { SimulationTelemetrySnapshot } from '../../simulation/runtime/ecsBlackboard';
import type { SlotSchema } from '../../types/slots';

const createSceneStub = () => {
  const statusListeners: Array<(status: ProgramRunnerStatus, mechanismId: string) => void> = [];
  const telemetryListeners: Array<(snapshot: SimulationTelemetrySnapshot, mechanismId: string | null) => void> = [];
  const telemetrySnapshots = new Map<string, SimulationTelemetrySnapshot>();
  const chassisListeners: Array<(snapshot: ChassisSnapshot) => void> = [];
  const debugListeners: Array<(state: ProgramDebugState, mechanismId: string) => void> = [];
  const debugStates = new Map<string, ProgramDebugState>();
  let chassisSnapshot: ChassisSnapshot = { capacity: 0, slots: [] };
  let selectedMechanismId: string | null = null;
  return {
    subscribeProgramStatus: vi.fn((listener: (status: ProgramRunnerStatus, mechanismId: string) => void) => {
      statusListeners.push(listener);
      return () => {
        const index = statusListeners.indexOf(listener);
        if (index >= 0) {
          statusListeners.splice(index, 1);
        }
      };
    }),
    getProgramStatus: vi.fn(() => 'idle' as const),
    runProgram: vi.fn(),
    stopProgram: vi.fn(),
    getInventorySnapshot: vi.fn(() => ({
      capacity: 0,
      used: 0,
      available: 0,
      entries: [],
      slots: [],
      slotCapacity: 0,
    })),
    subscribeInventory: vi.fn(() => () => {}),
    subscribeTelemetry: vi.fn((listener: (snapshot: SimulationTelemetrySnapshot, mechanismId: string | null) => void) => {
      telemetryListeners.push(listener);
      return () => {
        const index = telemetryListeners.indexOf(listener);
        if (index >= 0) {
          telemetryListeners.splice(index, 1);
        }
      };
    }),
    getTelemetrySnapshot: vi.fn((mechanismId: string = DEFAULT_MECHANISM_ID) => telemetrySnapshots.get(mechanismId) ?? { values: {}, actions: {} }),
    subscribeProgramDebug: vi.fn((listener: (state: ProgramDebugState, mechanismId: string) => void) => {
      debugListeners.push(listener);
      return () => {
        const index = debugListeners.indexOf(listener);
        if (index >= 0) {
          debugListeners.splice(index, 1);
        }
      };
    }),
    getProgramDebugState: vi.fn(
      (mechanismId: string = DEFAULT_MECHANISM_ID) =>
        debugStates.get(mechanismId) ?? {
          status: 'idle',
          program: null,
          currentInstruction: null,
          timeRemaining: 0,
          frames: [],
        },
    ),
    subscribeChassis: vi.fn((listener: (snapshot: ChassisSnapshot) => void) => {
      chassisListeners.push(listener);
      listener(chassisSnapshot);
      return () => {
        const index = chassisListeners.indexOf(listener);
        if (index >= 0) {
          chassisListeners.splice(index, 1);
        }
      };
    }),
    getChassisSnapshot: vi.fn(() => chassisSnapshot),
    getSelectedMechanism: vi.fn(() => selectedMechanismId),
    selectMechanism: vi.fn((mechanismId: string) => {
      selectedMechanismId = mechanismId;
    }),
    clearMechanismSelection: vi.fn(() => {
      selectedMechanismId = null;
    }),
    triggerStatus: (mechanismId: string, status: ProgramRunnerStatus) => {
      for (const listener of statusListeners) {
        listener(status, mechanismId);
      }
    },
    triggerTelemetry: (mechanismId: string, snapshot: SimulationTelemetrySnapshot) => {
      telemetrySnapshots.set(mechanismId, snapshot);
      for (const listener of telemetryListeners) {
        listener(snapshot, mechanismId);
      }
    },
    triggerDebugState: (mechanismId: string, state: ProgramDebugState) => {
      debugStates.set(mechanismId, state);
      for (const listener of debugListeners) {
        listener(state, mechanismId);
      }
    },
    triggerChassis: (snapshot: ChassisSnapshot) => {
      chassisSnapshot = snapshot;
      for (const listener of chassisListeners) {
        listener(snapshot);
      }
    },
  } as unknown as RootScene & {
    triggerStatus: (mechanismId: string, status: ProgramRunnerStatus) => void;
    triggerTelemetry: (mechanismId: string, snapshot: SimulationTelemetrySnapshot) => void;
    triggerChassis: (snapshot: ChassisSnapshot) => void;
  };
};

const createTelemetrySnapshot = (value: number): SimulationTelemetrySnapshot => ({
  values: {
    'mock.module': {
      metric: { value, metadata: {}, revision: 1 },
    },
  },
  actions: {},
});

describe('simulationRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    simulationRuntime.stopProgram(DEFAULT_MECHANISM_ID);
    simulationRuntime.stopProgram('MF-02');
    simulationRuntime.clearSelectedMechanism();
  });

  it('runs the default startup program when a scene registers', () => {
    const scene = createSceneStub();

    simulationRuntime.registerScene(scene);

    expect(scene.runProgram).toHaveBeenCalledWith(DEFAULT_MECHANISM_ID, DEFAULT_STARTUP_PROGRAM);

    scene.triggerStatus(DEFAULT_MECHANISM_ID, 'running');
    expect(simulationRuntime.getStatus(DEFAULT_MECHANISM_ID)).toBe('running');

    simulationRuntime.unregisterScene(scene);
  });

  it('restarts the default program after unregistering the previous scene', () => {
    const firstScene = createSceneStub();
    simulationRuntime.registerScene(firstScene);
    simulationRuntime.unregisterScene(firstScene);

    const secondScene = createSceneStub();
    simulationRuntime.registerScene(secondScene);

    expect(secondScene.runProgram).toHaveBeenCalledWith(DEFAULT_MECHANISM_ID, DEFAULT_STARTUP_PROGRAM);

    simulationRuntime.unregisterScene(secondScene);
  });

  it('prioritises queued programs over the default startup routine', () => {
    const customProgram: CompiledProgram = {
      instructions: [
        {
          kind: 'wait',
          duration: createNumberLiteralBinding(1, { label: 'Queued → wait' }),
          sourceBlockId: 'queued-wait',
        },
      ],
    };
    simulationRuntime.runProgram(DEFAULT_MECHANISM_ID, customProgram);

    const scene = createSceneStub();
    simulationRuntime.registerScene(scene);

    expect(scene.runProgram).toHaveBeenCalledWith(DEFAULT_MECHANISM_ID, customProgram);
    expect(scene.runProgram).not.toHaveBeenCalledWith(DEFAULT_MECHANISM_ID, DEFAULT_STARTUP_PROGRAM);

    simulationRuntime.unregisterScene(scene);
  });

  it('updates status to error when compile diagnostics include blocking failures', () => {
    const statuses: ProgramRunnerStatus[] = [];
    simulationRuntime.subscribeStatus(DEFAULT_MECHANISM_ID, (status) => {
      statuses.push(status);
    });

    simulationRuntime.reportCompileDiagnostics(DEFAULT_MECHANISM_ID, [
      { severity: 'error', message: 'Add a "When Started" block to trigger the routine.' },
    ]);

    expect(simulationRuntime.getStatus(DEFAULT_MECHANISM_ID)).toBe('error');
    expect(statuses).toContain('error');

    simulationRuntime.reportCompileDiagnostics(DEFAULT_MECHANISM_ID, []);

    expect(simulationRuntime.getStatus(DEFAULT_MECHANISM_ID)).toBe('idle');
    expect(statuses[statuses.length - 1]).toBe('idle');
  });

  it('tracks program status per mechanism independently', () => {
    const scene = createSceneStub();
    simulationRuntime.registerScene(scene);

    const mf01Statuses: ProgramRunnerStatus[] = [];
    const mf02Statuses: ProgramRunnerStatus[] = [];
    simulationRuntime.subscribeStatus('MF-01', (status) => {
      mf01Statuses.push(status);
    });
    simulationRuntime.subscribeStatus('MF-02', (status) => {
      mf02Statuses.push(status);
    });

    scene.triggerStatus('MF-01', 'running');
    expect(simulationRuntime.getStatus('MF-01')).toBe('running');
    expect(simulationRuntime.getStatus('MF-02')).toBe('idle');

    scene.triggerStatus('MF-02', 'running');
    expect(simulationRuntime.getStatus('MF-01')).toBe('running');
    expect(simulationRuntime.getStatus('MF-02')).toBe('running');

    scene.triggerStatus('MF-02', 'completed');
    expect(simulationRuntime.getStatus('MF-01')).toBe('running');
    expect(simulationRuntime.getStatus('MF-02')).toBe('completed');

    expect(mf01Statuses).toContain('running');
    expect(mf02Statuses).toEqual(['idle', 'running', 'completed']);

    simulationRuntime.unregisterScene(scene);
  });

  it('stores telemetry snapshots separately for each mechanism', () => {
    const scene = createSceneStub();
    simulationRuntime.registerScene(scene);

    const mf01Telemetry = createTelemetrySnapshot(1);
    const mf02Telemetry = createTelemetrySnapshot(2);

    scene.triggerTelemetry('MF-01', mf01Telemetry);
    expect(simulationRuntime.getTelemetrySnapshot('MF-01')).toEqual(mf01Telemetry);

    scene.triggerTelemetry('MF-02', mf02Telemetry);
    expect(simulationRuntime.getTelemetrySnapshot('MF-01')).toEqual(mf01Telemetry);
    expect(simulationRuntime.getTelemetrySnapshot('MF-02')).toEqual(mf02Telemetry);

    simulationRuntime.unregisterScene(scene);
  });

  it('applies inventory overlay updates to the runtime snapshot', () => {
    const slots: SlotSchema[] = [
      { id: 'inventory-0', index: 0, occupantId: 'core.movement', stackCount: 1, metadata: { stackable: false, locked: false } },
      { id: 'inventory-1', index: 1, occupantId: 'resource.ore', stackCount: 3, metadata: { stackable: true, locked: false } },
      { id: 'inventory-2', index: 2, occupantId: null, metadata: { stackable: true, locked: false } },
    ];

    simulationRuntime.applyInventoryOverlayUpdate({ capacity: 4, slots });

    const snapshot = simulationRuntime.getInventorySnapshot();
    expect(snapshot.slotCapacity).toBe(4);
    expect(snapshot.used).toBe(4);
    expect(snapshot.available).toBe(0);
    expect(snapshot.entries).toEqual([
      { resource: 'core.movement', quantity: 1 },
      { resource: 'resource.ore', quantity: 3 },
    ]);
    expect(snapshot.slots).toHaveLength(3);

    simulationRuntime.applyInventoryOverlayUpdate({ capacity: 0, slots: [] });
  });

  it('applies chassis overlay updates to the runtime snapshot', () => {
    const slots: SlotSchema[] = [
      { id: 'chassis-0', index: 0, occupantId: 'core.movement', metadata: { stackable: false, locked: false } },
      { id: 'chassis-1', index: 1, occupantId: 'sensor.survey', metadata: { stackable: false, locked: false } },
    ];

    simulationRuntime.applyChassisOverlayUpdate({ capacity: 2, slots });

    const snapshot = simulationRuntime.getChassisSnapshot();
    expect(snapshot.capacity).toBe(2);
    expect(snapshot.slots).toHaveLength(2);
    expect(snapshot.slots[0]?.occupantId).toBe('core.movement');
    expect(snapshot.slots[1]?.occupantId).toBe('sensor.survey');

    simulationRuntime.applyChassisOverlayUpdate({ capacity: 0, slots: [] });
  });
});

