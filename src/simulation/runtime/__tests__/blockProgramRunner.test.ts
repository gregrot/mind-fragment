import { describe, expect, it, vi } from 'vitest';
import { BlockProgramRunner } from '../blockProgramRunner';
import type { CompiledProgram } from '../blockProgram';
import { RobotChassis } from '../../robot';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from '../../robot/modules/moduleLibrary';

const createRobot = (): RobotChassis => {
  const robot = new RobotChassis();
  for (const moduleId of DEFAULT_MODULE_LOADOUT) {
    robot.attachModule(createModuleInstance(moduleId));
  }
  return robot;
};

describe('BlockProgramRunner', () => {
  it('applies movement instructions and returns to idle', () => {
    const robot = createRobot();
    const runner = new BlockProgramRunner(robot);
    const program: CompiledProgram = {
      instructions: [{ kind: 'move', duration: 1, speed: 40 }],
    };
    const actionSpy = vi.spyOn(robot, 'invokeAction');

    runner.load(program);
    expect(runner.getStatus()).toBe('running');

    runner.update(0.5);
    robot.tick(0.5);
    expect(actionSpy).toHaveBeenCalledWith(
      'core.movement',
      'setLinearVelocity',
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
    const linearCommand = actionSpy.mock.calls.find(([, actionName, payload]) => {
      if (actionName !== 'setLinearVelocity') {
        return false;
      }
      const typed = payload as { x?: number; y?: number } | undefined;
      const magnitude = Math.hypot(typed?.x ?? 0, typed?.y ?? 0);
      return magnitude > 0;
    });
    const linearPayload = linearCommand?.[2] as { x?: number; y?: number } | undefined;
    expect(linearPayload?.x).toBeCloseTo(40);
    expect(linearPayload?.y).toBeCloseTo(0);

    runner.update(0.6);
    robot.tick(0.6);
    expect(runner.getStatus()).toBe('completed');
    const finalLinearCommand = actionSpy.mock.calls
      .filter(([, actionName]) => actionName === 'setLinearVelocity')
      .at(-1);
    const finalLinearPayload = finalLinearCommand?.[2] as { x?: number; y?: number } | undefined;
    expect(finalLinearPayload?.x).toBeCloseTo(0);
    expect(finalLinearPayload?.y).toBeCloseTo(0);
  });

  it('applies turn instructions by adjusting angular velocity', () => {
    const robot = createRobot();
    const runner = new BlockProgramRunner(robot);
    const program: CompiledProgram = {
      instructions: [{ kind: 'turn', duration: 0.5, angularVelocity: Math.PI }],
    };
    const actionSpy = vi.spyOn(robot, 'invokeAction');

    runner.load(program);
    runner.update(0.25);
    robot.tick(0.25);
    const angularCommand = actionSpy.mock.calls.find(([, actionName, payload]) => {
      if (actionName !== 'setAngularVelocity') {
        return false;
      }
      const typed = payload as { value?: number } | undefined;
      return Math.abs(typed?.value ?? 0) > 0;
    });
    const angularPayload = angularCommand?.[2] as { value?: number } | undefined;
    expect(angularPayload?.value).toBeCloseTo(Math.PI);

    runner.update(0.5);
    robot.tick(0.5);
    const finalAngularCommand = actionSpy.mock.calls
      .filter(([, actionName]) => actionName === 'setAngularVelocity')
      .at(-1);
    const finalAngularPayload = finalAngularCommand?.[2] as { value?: number } | undefined;
    expect(finalAngularPayload?.value).toBeCloseTo(0);
  });

  it('scans for resources and gathers them into inventory', () => {
    const robot = createRobot();
    const runner = new BlockProgramRunner(robot);
    const program: CompiledProgram = {
      instructions: [
        { kind: 'scan', duration: 1, filter: null },
        { kind: 'gather', duration: 1.5, target: 'auto' },
      ],
    };
    const actionSpy = vi.spyOn(robot, 'invokeAction');
    const initialInventory = robot.getInventorySnapshot();

    runner.load(program);
    runner.update(1);
    robot.tick(1);
    runner.update(2);
    robot.tick(2);

    const finalInventory = robot.getInventorySnapshot();
    expect(finalInventory.used).toBeGreaterThan(initialInventory.used);
    expect(actionSpy).toHaveBeenCalledWith('sensor.survey', 'scan', expect.any(Object));
    expect(actionSpy).toHaveBeenCalledWith(
      'arm.manipulator',
      'gatherResource',
      expect.objectContaining({ nodeId: expect.any(String) }),
    );
  });

  it('loops gather instructions until the targeted node is depleted', () => {
    const robot = createRobot();
    const runner = new BlockProgramRunner(robot);
    const availableNodes = robot.resourceField.list();
    const robotState = robot.getStateSnapshot();
    const targetNode = availableNodes.reduce((closest, node) => {
      if (!closest) {
        return node;
      }
      const dx = node.position.x - robotState.position.x;
      const dy = node.position.y - robotState.position.y;
      const distance = Math.hypot(dx, dy);
      const closestDx = closest.position.x - robotState.position.x;
      const closestDy = closest.position.y - robotState.position.y;
      const closestDistance = Math.hypot(closestDx, closestDy);
      return distance < closestDistance ? node : closest;
    }, availableNodes[0]);

    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'loop',
          instructions: [{ kind: 'gather', duration: 1.5, target: 'auto' }],
        },
      ],
    };

    const actionSpy = vi.spyOn(robot, 'invokeAction');
    if (!targetNode) {
      throw new Error('Expected at least one resource node for loop test.');
    }

    runner.load(program);

    let safety = 0;
    while (true) {
      const quantity = robot.resourceField.list().find((node) => node.id === targetNode.id)?.quantity ?? 0;
      if (quantity <= 0) {
        break;
      }
      safety += 1;
      runner.update(1.5);
      robot.tick(1.5);
      if (safety > 12) {
        break;
      }
    }

    const finalNode = robot.resourceField.list().find((node) => node.id === targetNode.id);
    expect(finalNode?.quantity).toBe(0);

    const gatherCallsWithIndex = actionSpy.mock.calls
      .map((call, index) => ({ call, index }))
      .filter((entry) => entry.call[1] === 'gatherResource');
    expect(gatherCallsWithIndex.length).toBeGreaterThan(1);
    const uniqueTargets = new Set(
      gatherCallsWithIndex.map((entry) => ((entry.call[2] as { nodeId?: string }) ?? {}).nodeId),
    );
    expect(uniqueTargets).toEqual(new Set([targetNode.id]));

    const finalGatherIndex = gatherCallsWithIndex.at(-1)?.index ?? -1;
    const finalResult = actionSpy.mock.results[finalGatherIndex]?.value as { remaining?: number } | undefined;
    expect(finalResult?.remaining).toBe(0);
  });
});
