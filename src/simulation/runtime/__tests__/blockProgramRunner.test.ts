import { describe, expect, it, vi } from 'vitest';
import { BlockProgramRunner } from '../blockProgramRunner';
import {
  createBooleanLiteralBinding,
  createBooleanLiteralExpression,
  createNumberLiteralBinding,
  createNumberLiteralExpression,
  type CompiledProgram,
  type NumberExpression,
} from '../blockProgram';
import { RobotChassis } from '../../robot';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from '../../robot/modules/moduleLibrary';

const STATUS_SIGNAL_DESCRIPTOR = {
  id: 'status.signal.active',
  label: 'Status Indicator – Active',
  description: undefined,
  moduleId: 'status.signal',
  signalId: 'active',
} as const;

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
      instructions: [
        {
          kind: 'move',
          duration: createNumberLiteralBinding(1, { label: 'Test → move duration' }),
          speed: createNumberLiteralBinding(40, { label: 'Test → move speed' }),
        },
      ],
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
      instructions: [
        {
          kind: 'turn',
          duration: createNumberLiteralBinding(0.5, { label: 'Test → turn duration' }),
          angularVelocity: createNumberLiteralBinding(Math.PI, { label: 'Test → turn rate' }),
        },
      ],
    };
    const actionSpy = vi.spyOn(robot, 'invokeAction');

    runner.load(program);
    runner.update(0.25);
    robot.tick(0.25);
    const angularCalls = actionSpy.mock.calls.filter(([, actionName]) => actionName === 'setAngularVelocity');
    const firstNonZero = angularCalls.find(([, , payload]) => Math.abs(((payload as { value?: number })?.value ?? 0)) > 1e-5);
    const firstPayload = firstNonZero?.[2] as { value?: number } | undefined;
    expect(firstPayload?.value).toBeCloseTo(Math.PI);

    runner.update(0.5);
    robot.tick(0.5);
    const allAngularCalls = actionSpy.mock.calls.filter(([, actionName]) => actionName === 'setAngularVelocity');
    expect(
      allAngularCalls.some(([, , payload]) => Math.abs(((payload as { value?: number })?.value ?? 0)) < 1e-5),
    ).toBe(true);
  });

  it('scans for resources and gathers them into inventory', () => {
    const robot = createRobot();
    const runner = new BlockProgramRunner(robot);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'scan',
          duration: createNumberLiteralBinding(1, { label: 'Test → scan duration' }),
          filter: null,
        },
        {
          kind: 'gather',
          duration: createNumberLiteralBinding(1.5, { label: 'Test → gather duration' }),
          target: 'auto',
        },
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

  it('steers towards the most recent scan hit when executing move-to instructions', () => {
    const robot = new RobotChassis({ state: { orientation: Math.PI / 2 } });
    for (const moduleId of DEFAULT_MODULE_LOADOUT) {
      robot.attachModule(createModuleInstance(moduleId));
    }

    const runner = new BlockProgramRunner(robot);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'scan',
          duration: createNumberLiteralBinding(1, { label: 'Test → scan duration' }),
          filter: null,
        },
        {
          kind: 'move-to',
          duration: createNumberLiteralBinding(4, { label: 'Test → move-to duration' }),
          speed: createNumberLiteralBinding(80, { label: 'Test → move-to speed' }),
          target: {
            useScanHit: createBooleanLiteralBinding(true, { label: 'Test → use scan hit' }),
            scanHitIndex: createNumberLiteralBinding(1, { label: 'Test → scan hit index' }),
            literalPosition: {
              x: createNumberLiteralBinding(0, { label: 'Test → fallback X' }),
              y: createNumberLiteralBinding(0, { label: 'Test → fallback Y' }),
            },
          },
        },
      ],
    };

    const actionSpy = vi.spyOn(robot, 'invokeAction');

    runner.load(program);
    runner.update(0.5);
    robot.tick(0.5);
    runner.update(0.5);

    const node = robot.resourceField.list().find((candidate) => candidate.id === 'node-silicate-1');
    if (!node) {
      throw new Error('Expected the default silicate node to be present.');
    }

    const beforeState = robot.getStateSnapshot();
    const beforeDistance = Math.hypot(
      node.position.x - beforeState.position.x,
      node.position.y - beforeState.position.y,
    );

    for (let i = 0; i < 8; i += 1) {
      runner.update(0.25);
      robot.tick(0.25);
    }

    const afterState = robot.getStateSnapshot();
    const afterDistance = Math.hypot(
      node.position.x - afterState.position.x,
      node.position.y - afterState.position.y,
    );

    expect(afterDistance).toBeLessThan(beforeDistance);

    const angularCalls = actionSpy.mock.calls.filter(([, actionName]) => actionName === 'setAngularVelocity');
    expect(
      angularCalls.some(([, , payload]) => Math.abs(((payload as { value?: number })?.value ?? 0)) > 1e-3),
    ).toBe(true);

    const linearCalls = actionSpy.mock.calls.filter(([, actionName]) => actionName === 'setLinearVelocity');
    expect(
      linearCalls.some(([, , payload]) => {
        const typed = (payload as { x?: number; y?: number }) ?? {};
        return Math.hypot(typed.x ?? 0, typed.y ?? 0) > 0.5;
      }),
    ).toBe(true);
    expect(
      linearCalls.every(([, , payload]) => {
        const typed = (payload as { x?: number; y?: number }) ?? {};
        return Math.hypot(typed.x ?? 0, typed.y ?? 0) <= 120 + 1e-6;
      }),
    ).toBe(true);
  });

  it('drops carried resources when executing a deposit instruction', () => {
    const robot = createRobot();
    robot.inventory.store('ferrous-ore', 6);
    robot.inventory.store('silicate-crystal', 3);

    const runner = new BlockProgramRunner(robot);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'deposit',
          duration: createNumberLiteralBinding(1, { label: 'Test → deposit duration' }),
        },
      ],
    };

    runner.load(program);
    runner.update(1);
    robot.tick(1);

    const inventoryAfter = robot.getInventorySnapshot();
    expect(inventoryAfter.used).toBe(0);

    const robotState = robot.getStateSnapshot();
    const nodes = robot.resourceField.list();
    const nearbyNodes = nodes.filter((node) => {
      const dx = node.position.x - robotState.position.x;
      const dy = node.position.y - robotState.position.y;
      return Math.hypot(dx, dy) <= 1;
    });
    expect(nearbyNodes.length).toBeGreaterThanOrEqual(2);
    const ferrousPile = nearbyNodes.find((node) => node.type === 'ferrous-ore');
    const silicatePile = nearbyNodes.find((node) => node.type === 'silicate-crystal');
    expect(ferrousPile?.quantity).toBeGreaterThanOrEqual(6);
    expect(silicatePile?.quantity).toBeGreaterThanOrEqual(3);
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
          mode: 'forever',
          instructions: [
            {
              kind: 'gather',
              duration: createNumberLiteralBinding(1.5, { label: 'Test → gather duration' }),
              target: 'auto',
            },
          ],
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
    const finalGatherIndex = gatherCallsWithIndex.at(-1)?.index ?? -1;
    const finalResult = actionSpy.mock.results[finalGatherIndex]?.value as { remaining?: number } | undefined;
    expect(finalResult?.remaining).toBe(0);
  });

  it('evaluates counted loops using operator expressions', () => {
    const robot = createRobot();
    const runner = new BlockProgramRunner(robot);
    const iterations = createNumberLiteralBinding(1, { label: 'Test → repeat count' });
    const operator: NumberExpression = {
      kind: 'operator',
      valueType: 'number',
      operator: 'add',
      inputs: [
        createNumberLiteralExpression(1, { source: 'user', label: 'Operand A' }),
        createNumberLiteralExpression(2, { source: 'user', label: 'Operand B' }),
      ],
      label: 'Add Numbers',
    };
    iterations.expression = operator;

    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'loop',
          mode: 'counted',
          iterations,
          instructions: [
            {
              kind: 'move',
              duration: createNumberLiteralBinding(0.2, { label: 'Test → move duration' }),
              speed: createNumberLiteralBinding(10, { label: 'Test → move speed' }),
            },
          ],
        },
      ],
    };

    const actionSpy = vi.spyOn(robot, 'invokeAction');

    runner.load(program);
    runner.update(3);
    robot.tick(3);

    const moveCalls = actionSpy.mock.calls.filter(([, actionName]) => actionName === 'setLinearVelocity');
    expect(moveCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('branches based on signal telemetry', () => {
    const robot = createRobot();
    const runner = new BlockProgramRunner(robot);
    const condition = createBooleanLiteralBinding(false, { label: 'Test → branch condition' });
    condition.expression = {
      kind: 'signal',
      valueType: 'boolean',
      signal: STATUS_SIGNAL_DESCRIPTOR,
      fallback: createBooleanLiteralExpression(false, { label: 'Condition fallback' }),
    };

    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'branch',
          condition,
          whenTrue: [
            {
              kind: 'status-set',
              duration: createNumberLiteralBinding(0, { label: 'Branch → true duration' }),
              value: createBooleanLiteralBinding(true, { label: 'Branch → true value' }),
            },
          ],
          whenFalse: [
            {
              kind: 'status-set',
              duration: createNumberLiteralBinding(0, { label: 'Branch → false duration' }),
              value: createBooleanLiteralBinding(false, { label: 'Branch → false value' }),
            },
          ],
        },
      ],
    };

    runner.load(program);
    runner.update(0.1);
    robot.tick(0.1);
    let telemetry = robot.getTelemetrySnapshot();
    expect(telemetry.values['status.signal']?.active.value).toBe(false);

    robot.invokeAction('status.signal', 'setStatus', { value: true });
    runner.load(program);
    runner.update(0.1);
    robot.tick(0.1);
    telemetry = robot.getTelemetrySnapshot();
    expect(telemetry.values['status.signal']?.active.value).toBe(true);
  });

  it('exposes debug state including current instruction and frame stack', () => {
    const robot = createRobot();
    const runner = new BlockProgramRunner(robot);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'move',
          duration: createNumberLiteralBinding(1, { label: 'Debug → move duration' }),
          speed: createNumberLiteralBinding(20, { label: 'Debug → move speed' }),
        },
        {
          kind: 'loop',
          mode: 'forever',
          instructions: [
            {
              kind: 'turn',
              duration: createNumberLiteralBinding(0.5, { label: 'Debug → turn duration' }),
              angularVelocity: createNumberLiteralBinding(Math.PI, { label: 'Debug → turn rate' }),
            },
          ],
        },
      ],
    };

    runner.load(program);

    const initialDebug = runner.getDebugState();
    expect(initialDebug.status).toBe('running');
    expect(initialDebug.program).toBe(program);
    expect(initialDebug.currentInstruction?.kind).toBe('move');
    expect(initialDebug.frames).toHaveLength(1);
    expect(initialDebug.frames[0]).toMatchObject({ kind: 'sequence', index: 0, length: 2 });

    runner.update(1.1);
    robot.tick(1.1);

    const loopDebug = runner.getDebugState();
    expect(loopDebug.currentInstruction?.kind).toBe('turn');
    expect(loopDebug.frames).toEqual([
      expect.objectContaining({ kind: 'sequence', index: 2, length: 2 }),
      expect.objectContaining({ kind: 'loop', index: 0, length: 1 }),
    ]);
  });
});
