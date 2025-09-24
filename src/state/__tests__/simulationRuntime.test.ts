import { describe, expect, it, beforeEach, vi } from 'vitest';
import { simulationRuntime } from '../simulationRuntime';
import { DEFAULT_STARTUP_PROGRAM } from '../../simulation/runtime/defaultProgram';
import { DEFAULT_ROBOT_ID } from '../../simulation/runtime/simulationWorld';
import { createNumberLiteralBinding, type CompiledProgram } from '../../simulation/runtime/blockProgram';
import type { RootScene } from '../../simulation/rootScene';
import type { ChassisSnapshot } from '../../simulation/robot';
import type { ProgramRunnerStatus } from '../../simulation/runtime/blockProgramRunner';
import type { SimulationTelemetrySnapshot } from '../../simulation/runtime/ecsBlackboard';

const createSceneStub = () => {
  const statusListeners: Array<(status: ProgramRunnerStatus, robotId: string) => void> = [];
  const telemetryListeners: Array<(snapshot: SimulationTelemetrySnapshot, robotId: string | null) => void> = [];
  const telemetrySnapshots = new Map<string, SimulationTelemetrySnapshot>();
  const chassisListeners: Array<(snapshot: ChassisSnapshot) => void> = [];
  let chassisSnapshot: ChassisSnapshot = { capacity: 0, slots: [] };
  let selectedRobotId: string | null = null;
  return {
    subscribeProgramStatus: vi.fn((listener: (status: ProgramRunnerStatus, robotId: string) => void) => {
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
    getInventorySnapshot: vi.fn(() => ({ capacity: 0, used: 0, available: 0, entries: [] })),
    subscribeInventory: vi.fn(() => () => {}),
    subscribeTelemetry: vi.fn((listener: (snapshot: SimulationTelemetrySnapshot, robotId: string | null) => void) => {
      telemetryListeners.push(listener);
      return () => {
        const index = telemetryListeners.indexOf(listener);
        if (index >= 0) {
          telemetryListeners.splice(index, 1);
        }
      };
    }),
    getTelemetrySnapshot: vi.fn((robotId: string = DEFAULT_ROBOT_ID) => telemetrySnapshots.get(robotId) ?? { values: {}, actions: {} }),
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
    getSelectedRobot: vi.fn(() => selectedRobotId),
    selectRobot: vi.fn((robotId: string) => {
      selectedRobotId = robotId;
    }),
    clearRobotSelection: vi.fn(() => {
      selectedRobotId = null;
    }),
    triggerStatus: (robotId: string, status: ProgramRunnerStatus) => {
      for (const listener of statusListeners) {
        listener(status, robotId);
      }
    },
    triggerTelemetry: (robotId: string, snapshot: SimulationTelemetrySnapshot) => {
      telemetrySnapshots.set(robotId, snapshot);
      for (const listener of telemetryListeners) {
        listener(snapshot, robotId);
      }
    },
    triggerChassis: (snapshot: ChassisSnapshot) => {
      chassisSnapshot = snapshot;
      for (const listener of chassisListeners) {
        listener(snapshot);
      }
    },
  } as unknown as RootScene & {
    triggerStatus: (robotId: string, status: ProgramRunnerStatus) => void;
    triggerTelemetry: (robotId: string, snapshot: SimulationTelemetrySnapshot) => void;
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
    simulationRuntime.stopProgram(DEFAULT_ROBOT_ID);
    simulationRuntime.stopProgram('MF-02');
    simulationRuntime.clearSelectedRobot();
  });

  it('runs the default startup program when a scene registers', () => {
    const scene = createSceneStub();

    simulationRuntime.registerScene(scene);

    expect(scene.runProgram).toHaveBeenCalledWith(DEFAULT_ROBOT_ID, DEFAULT_STARTUP_PROGRAM);

    scene.triggerStatus(DEFAULT_ROBOT_ID, 'running');
    expect(simulationRuntime.getStatus(DEFAULT_ROBOT_ID)).toBe('running');

    simulationRuntime.unregisterScene(scene);
  });

  it('restarts the default program after unregistering the previous scene', () => {
    const firstScene = createSceneStub();
    simulationRuntime.registerScene(firstScene);
    simulationRuntime.unregisterScene(firstScene);

    const secondScene = createSceneStub();
    simulationRuntime.registerScene(secondScene);

    expect(secondScene.runProgram).toHaveBeenCalledWith(DEFAULT_ROBOT_ID, DEFAULT_STARTUP_PROGRAM);

    simulationRuntime.unregisterScene(secondScene);
  });

  it('prioritises queued programs over the default startup routine', () => {
    const customProgram: CompiledProgram = {
      instructions: [
        { kind: 'wait', duration: createNumberLiteralBinding(1, { label: 'Queued → wait' }) },
      ],
    };
    simulationRuntime.runProgram(DEFAULT_ROBOT_ID, customProgram);

    const scene = createSceneStub();
    simulationRuntime.registerScene(scene);

    expect(scene.runProgram).toHaveBeenCalledWith(DEFAULT_ROBOT_ID, customProgram);
    expect(scene.runProgram).not.toHaveBeenCalledWith(DEFAULT_ROBOT_ID, DEFAULT_STARTUP_PROGRAM);

    simulationRuntime.unregisterScene(scene);
  });

  it('tracks program status per robot independently', () => {
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

  it('stores telemetry snapshots separately for each robot', () => {
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
});

