import { describe, expect, it, beforeEach, vi } from 'vitest';
import { simulationRuntime } from '../simulationRuntime';
import { DEFAULT_STARTUP_PROGRAM } from '../../simulation/runtime/defaultProgram';
import type { RootScene } from '../../simulation/rootScene';

const createSceneStub = () => {
  const subscriptions: { status: ((status: string) => void) | null } = { status: null };
  return {
    subscribeProgramStatus: vi.fn((listener: (status: string) => void) => {
      subscriptions.status = listener;
      return () => {
        subscriptions.status = null;
      };
    }),
    getProgramStatus: vi.fn(() => 'idle' as const),
    runProgram: vi.fn(),
    stopProgram: vi.fn(),
    getInventorySnapshot: vi.fn(() => ({ capacity: 0, used: 0, available: 0, entries: [] })),
    subscribeInventory: vi.fn(() => () => {}),
    subscribeTelemetry: vi.fn(() => () => {}),
    getTelemetrySnapshot: vi.fn(() => ({ values: {}, actions: {} })),
    getSelectedRobot: vi.fn(() => null),
    selectRobot: vi.fn(),
    clearRobotSelection: vi.fn(),
    triggerStatus: (status: Parameters<NonNullable<typeof subscriptions.status>>[0]) => {
      subscriptions.status?.(status);
    },
  } as unknown as RootScene & { triggerStatus: (status: Parameters<NonNullable<typeof subscriptions.status>>[0]) => void };
};

describe('simulationRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    simulationRuntime.stopProgram();
  });

  it('runs the default startup program when a scene registers', () => {
    const scene = createSceneStub();

    simulationRuntime.registerScene(scene);

    expect(scene.runProgram).toHaveBeenCalledWith(DEFAULT_STARTUP_PROGRAM);

    scene.triggerStatus('running');
    expect(simulationRuntime.getStatus()).toBe('running');

    simulationRuntime.unregisterScene(scene);
  });

  it('restarts the default program after unregistering the previous scene', () => {
    const firstScene = createSceneStub();
    simulationRuntime.registerScene(firstScene);
    simulationRuntime.unregisterScene(firstScene);

    const secondScene = createSceneStub();
    simulationRuntime.registerScene(secondScene);

    expect(secondScene.runProgram).toHaveBeenCalledWith(DEFAULT_STARTUP_PROGRAM);

    simulationRuntime.unregisterScene(secondScene);
  });

  it('prioritises queued programs over the default startup routine', () => {
    const customProgram = { instructions: [{ kind: 'wait' as const, duration: 1 }] };
    simulationRuntime.runProgram(customProgram);

    const scene = createSceneStub();
    simulationRuntime.registerScene(scene);

    expect(scene.runProgram).toHaveBeenCalledWith(customProgram);
    expect(scene.runProgram).not.toHaveBeenCalledWith(DEFAULT_STARTUP_PROGRAM);

    simulationRuntime.unregisterScene(scene);
  });
});

