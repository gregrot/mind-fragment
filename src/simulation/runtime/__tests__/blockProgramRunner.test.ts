import { describe, expect, it, vi } from 'vitest';
import { BlockProgramRunner } from '../blockProgramRunner';
import {
  createBooleanLiteralBinding,
  createBooleanLiteralExpression,
  createNumberLiteralBinding,
  createNumberLiteralExpression,
  type CompiledProgram,
  type NumberExpression,
  type StringLiteralValue,
  type UseItemInstruction,
} from '../blockProgram';
import { MechanismChassis } from '../../mechanism';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from '../../mechanism/modules/moduleLibrary';
import { DEFAULT_STORAGE_BOX_ID } from '../../storage/storageBox';
import { DEFAULT_STARTUP_PROGRAM } from '../defaultProgram';

const STATUS_SIGNAL_DESCRIPTOR = {
  id: 'status.signal.active',
  label: 'Status Indicator – Active',
  description: undefined,
  moduleId: 'status.signal',
  signalId: 'active',
} as const;

const createMechanism = (): MechanismChassis => {
  const mechanism = new MechanismChassis();
  for (const moduleId of DEFAULT_MODULE_LOADOUT) {
    mechanism.attachModule(createModuleInstance(moduleId));
  }
  return mechanism;
};

describe('BlockProgramRunner', () => {
  it('applies movement instructions and returns to idle', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'move',
          duration: createNumberLiteralBinding(1, { label: 'Test → move duration' }),
          speed: createNumberLiteralBinding(40, { label: 'Test → move speed' }),
          sourceBlockId: 'test-move',
        },
      ],
    };
    const actionSpy = vi.spyOn(mechanism, 'invokeAction');

    runner.load(program);
    expect(runner.getStatus()).toBe('running');

    runner.update(0.5);
    mechanism.tick(0.5);
    expect(actionSpy).toHaveBeenCalledWith(
      'core.movement',
      'setLinearVelocity',
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );

    runner.update(0.6);
    mechanism.tick(0.6);
    expect(runner.getStatus()).toBe('completed');
    const finalLinearCommand = actionSpy.mock.calls
      .filter(([, actionName]) => actionName === 'setLinearVelocity')
      .at(-1);
    const finalLinearPayload = finalLinearCommand?.[2] as { x?: number; y?: number } | undefined;
    expect(finalLinearPayload?.x).toBeCloseTo(0);
    expect(finalLinearPayload?.y).toBeCloseTo(0);
  });

  it('applies turn instructions by adjusting angular velocity', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'turn',
          duration: createNumberLiteralBinding(0.5, { label: 'Test → turn duration' }),
          angularVelocity: createNumberLiteralBinding(Math.PI, { label: 'Test → turn rate' }),
          sourceBlockId: 'test-turn',
        },
      ],
    };
    const actionSpy = vi.spyOn(mechanism, 'invokeAction');

    runner.load(program);
    runner.update(0.25);
    mechanism.tick(0.25);
    const angularCalls = actionSpy.mock.calls.filter(([, actionName]) => actionName === 'setAngularVelocity');
    const firstNonZero = angularCalls.find(([, , payload]) => Math.abs(((payload as { value?: number })?.value ?? 0)) > 1e-5);
    const firstPayload = firstNonZero?.[2] as { value?: number } | undefined;
    expect(firstPayload?.value).toBeCloseTo(Math.PI);

    runner.update(0.5);
    mechanism.tick(0.5);
    const allAngularCalls = actionSpy.mock.calls.filter(([, actionName]) => actionName === 'setAngularVelocity');
    expect(
      allAngularCalls.some(([, , payload]) => Math.abs(((payload as { value?: number })?.value ?? 0)) < 1e-5),
    ).toBe(true);
  });

  it('scans for resources and gathers them into inventory', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'scan',
          duration: createNumberLiteralBinding(1, { label: 'Test → scan duration' }),
          filter: null,
          sourceBlockId: 'test-scan',
        },
        {
          kind: 'gather',
          duration: createNumberLiteralBinding(1.5, { label: 'Test → gather duration' }),
          target: 'auto',
          sourceBlockId: 'test-gather',
        },
      ],
    };
    const originalInvoke = mechanism.invokeAction.bind(mechanism);
    const actionSpy = vi.spyOn(mechanism, 'invokeAction');
    const targetNode = mechanism
      .resourceField
      .list()
      .find((candidate) => candidate.id === 'node-ferrous-1');
    if (!targetNode) {
      throw new Error('Expected the default silicate resource node to exist.');
    }

    const state = mechanism.getStateSnapshot();
    const distanceToNode = Math.hypot(
      targetNode.position.x - state.position.x,
      targetNode.position.y - state.position.y,
    );

    actionSpy.mockImplementation((moduleId, actionName, payload) => {
      if (moduleId === 'sensor.survey' && actionName === 'scan') {
        return {
          status: 'ok',
          filter: null,
          resources: {
            filter: null,
            hits: [
              {
                id: undefined,
                type: targetNode.type,
                quantity: targetNode.quantity,
                distance: distanceToNode,
                position: { ...targetNode.position },
              },
            ],
            total: 1,
          },
        };
      }
      return originalInvoke(moduleId, actionName, payload);
    });
    const initialInventory = mechanism.getInventorySnapshot();

    runner.load(program);
    runner.update(1);
    mechanism.tick(1);
    runner.update(2);
    mechanism.tick(2);

    const finalInventory = mechanism.getInventorySnapshot();
    expect(finalInventory.used).toBeGreaterThan(initialInventory.used);
    expect(actionSpy).toHaveBeenCalledWith('sensor.survey', 'scan', expect.any(Object));
    const gatherCall = actionSpy.mock.calls.find(
      ([moduleId, actionName]) => moduleId === 'arm.manipulator' && actionName === 'gatherResource',
    );
    expect(gatherCall?.[2]).toEqual(expect.objectContaining({ nodeId: targetNode.id }));
    actionSpy.mockRestore();
  });

  it('uses the configured tool slot against scanned targets with timed swings', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);

    const targetNode = mechanism.resourceField.upsertNode({
      id: 'arboreal-target-1',
      type: 'arboreal-node',
      position: { x: 48, y: 18 },
      quantity: 3,
      metadata: { hitPoints: 3, hitsRemaining: 3, requiredTool: 'axe' },
    });

    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'scan',
          duration: createNumberLiteralBinding(0.25, { label: 'Test → scan duration' }),
          filter: null,
          sourceBlockId: 'test-scan-for-tool',
        },
        {
          kind: 'use-item',
          duration: createNumberLiteralBinding(3, { label: 'Test → tool duration' }),
          slot: {
            index: createNumberLiteralBinding(1, { label: 'Test → slot index' }),
            label: { value: 'Primary Tool', source: 'default', label: 'Test → slot label' },
          },
          target: {
            useScanHit: createBooleanLiteralBinding(true, { label: 'Test → use scan hit' }),
            scanHitIndex: createNumberLiteralBinding(1, { label: 'Test → scan hit index' }),
            literalPosition: {
              x: createNumberLiteralBinding(0, { label: 'Test → target X' }),
              y: createNumberLiteralBinding(0, { label: 'Test → target Y' }),
            },
          },
          sourceBlockId: 'test-use-tool',
        } satisfies UseItemInstruction,
      ],
    } satisfies CompiledProgram;

    const originalInvoke = mechanism.invokeAction.bind(mechanism);
    const actionSpy = vi.spyOn(mechanism, 'invokeAction');
    const distanceToNode = Math.hypot(
      targetNode.position.x - mechanism.getStateSnapshot().position.x,
      targetNode.position.y - mechanism.getStateSnapshot().position.y,
    );

    actionSpy.mockImplementation((moduleId, actionName, payload) => {
      if (moduleId === 'sensor.survey' && actionName === 'scan') {
        return {
          status: 'ok',
          filter: null,
          resources: {
            filter: null,
            total: 1,
            hits: [
              {
                id: targetNode.id,
                type: targetNode.type,
                quantity: targetNode.quantity,
                distance: distanceToNode,
                position: { ...targetNode.position },
              },
            ],
          },
        };
      }
      return originalInvoke(moduleId, actionName, payload);
    });

    runner.load(program);

    runner.update(0.25);
    mechanism.tick(0.25);

    runner.update(1);
    mechanism.tick(1);
    runner.update(1);
    mechanism.tick(1);
    runner.update(1);
    mechanism.tick(1);

    expect(runner.getStatus()).toBe('completed');

    const useCalls = actionSpy.mock.calls.filter(
      ([moduleId, actionName]) => moduleId === 'arm.manipulator' && actionName === 'useInventoryItem',
    );
    expect(useCalls).toHaveLength(3);
    const [firstCall] = useCalls;
    const firstPayload = firstCall?.[2] as { slot?: number; nodeId?: string; target?: { x?: number; y?: number } } | undefined;
    expect(firstPayload?.slot).toBe(0);
    expect(firstPayload?.nodeId).toBe(targetNode.id);
    expect(firstPayload?.target).toEqual(targetNode.position);

    const remainingNode = mechanism.resourceField
      .list()
      .find((candidate) => candidate.id === targetNode.id);
    expect(remainingNode?.quantity).toBe(0);

    actionSpy.mockRestore();
  });

  it('harvests logs from a tree by looping scan, move-to, tool use, and gather instructions', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);

    const upsertSpy = vi.spyOn(mechanism.resourceField, 'upsertNode');

    const tree = mechanism.resourceField.upsertNode({
      id: 'playtest-tree',
      type: 'tree',
      position: { x: 80, y: 0 },
      quantity: 3,
      metadata: { hitPoints: 3, hitsRemaining: 3, requiredTool: 'axe', drop: { type: 'log', quantity: 2 } },
    });

    for (const node of mechanism.resourceField.list()) {
      if (node.id !== tree.id) {
        mechanism.resourceField.removeNode(node.id);
      }
    }

    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'loop',
          mode: 'forever',
          instructions: [
            {
              kind: 'scan',
              duration: createNumberLiteralBinding(0.25, { label: 'Tree loop → scan duration' }),
              filter: null,
              sourceBlockId: 'tree-loop-scan',
            },
            {
              kind: 'move-to',
              duration: createNumberLiteralBinding(1.5, { label: 'Tree loop → move-to duration' }),
              speed: createNumberLiteralBinding(80, { label: 'Tree loop → move-to speed' }),
              target: {
                useScanHit: createBooleanLiteralBinding(true, { label: 'Tree loop → use scan hit' }),
                scanHitIndex: createNumberLiteralBinding(1, { label: 'Tree loop → scan hit index' }),
                literalPosition: {
                  x: createNumberLiteralBinding(tree.position.x, { label: 'Tree loop → fallback X' }),
                  y: createNumberLiteralBinding(tree.position.y, { label: 'Tree loop → fallback Y' }),
                },
              },
              sourceBlockId: 'tree-loop-move-to',
            },
            {
              kind: 'use-item',
              duration: createNumberLiteralBinding(3, { label: 'Tree loop → tool duration' }),
              slot: {
                index: createNumberLiteralBinding(1, { label: 'Tree loop → slot index' }),
                label: { value: 'Primary Tool', source: 'default', label: 'Tree loop → slot label' },
              },
              target: {
                useScanHit: createBooleanLiteralBinding(true, { label: 'Tree loop → use scan target' }),
                scanHitIndex: createNumberLiteralBinding(1, { label: 'Tree loop → scan target index' }),
                literalPosition: {
                  x: createNumberLiteralBinding(tree.position.x, { label: 'Tree loop → literal X' }),
                  y: createNumberLiteralBinding(tree.position.y, { label: 'Tree loop → literal Y' }),
                },
              },
              sourceBlockId: 'tree-loop-use-item',
            },
            {
              kind: 'gather',
              duration: createNumberLiteralBinding(1, { label: 'Tree loop → gather duration' }),
              target: 'auto',
              sourceBlockId: 'tree-loop-gather',
            },
            {
              kind: 'wait',
              duration: createNumberLiteralBinding(0.5, { label: 'Tree loop → wait duration' }),
              sourceBlockId: 'tree-loop-wait',
            },
          ],
          sourceBlockId: 'tree-loop-forever',
        },
      ],
    } satisfies CompiledProgram;

    runner.load(program);

    const simulateStep = (seconds: number) => {
      runner.update(seconds);
      mechanism.tick(seconds);
    };

    let sawTreeDepleted = false;

    for (let index = 0; index < 24; index += 1) {
      simulateStep(0.5);
      const nodesDuringLoop = mechanism.resourceField.list();
      const treeNode = nodesDuringLoop.find((node) => node.id === tree.id);
      if (!treeNode || treeNode.quantity <= 0) {
        sawTreeDepleted = true;
      }
    }

    expect(sawTreeDepleted).toBe(true);

    const logDropCall = upsertSpy.mock.calls.find((call) => {
      const options = call[0] as { type?: string } | undefined;
      return options?.type === 'log';
    });
    expect(logDropCall).toBeDefined();
    expect(((logDropCall?.[0] as { quantity?: number })?.quantity ?? 0)).toBeGreaterThanOrEqual(2);

    const nodes = mechanism.resourceField.list();
    const harvestedTree = nodes.find((node) => node.id === tree.id);
    expect(!harvestedTree || harvestedTree.quantity <= 0).toBe(true);
    expect(nodes.filter((node) => node.type === 'log').length).toBeGreaterThanOrEqual(1);

    const inventory = mechanism.getInventorySnapshot();
    expect(inventory.entries).toContainEqual(expect.objectContaining({ resource: 'log', quantity: 2 }));

    upsertSpy.mockRestore();
  });

  it('runs the default startup program to chop trees and collect logs', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);

    // Limit the field to trees so the scan filter stays focused on arboreal targets.
    for (const node of mechanism.resourceField.list()) {
      if (node.type !== 'tree') {
        mechanism.resourceField.removeNode(node.id);
      }
    }

    const secondaryTree = mechanism.resourceField
      .list()
      .find((node) => node.id === 'node-tree-2');
    if (secondaryTree) {
      mechanism.resourceField.removeNode(secondaryTree.id);
    }

    runner.load(DEFAULT_STARTUP_PROGRAM);

    const simulateStep = (seconds: number) => {
      runner.update(seconds);
      mechanism.tick(seconds);
    };

    let observedInventoryUsage = false;
    let observedTreeDepletion = false;

    for (let stepIndex = 0; stepIndex < 160; stepIndex += 1) {
      simulateStep(0.5);

      const inventorySnapshot = mechanism.getInventorySnapshot();
      if (inventorySnapshot.used > 0) {
        observedInventoryUsage = true;
      }

      const telemetry = mechanism.getTelemetrySnapshot();
      const manipulatorTelemetry = telemetry.values['arm.manipulator']?.lastGather;
      const lastGather =
        manipulatorTelemetry && typeof manipulatorTelemetry.value === 'object'
          ? (manipulatorTelemetry.value as { type?: string | null; harvested?: number | null } | null)
          : null;
      if (lastGather && lastGather.type === 'log' && (lastGather.harvested ?? 0) > 0) {
        observedInventoryUsage = true;
      }

      const remainingTrees = mechanism.resourceField
        .list()
        .filter((node) => node.type === 'tree');
      if (remainingTrees.some((node) => node.quantity <= 0)) {
        observedTreeDepletion = true;
      }

      if (observedInventoryUsage && observedTreeDepletion) {
        break;
      }
    }

    expect(observedInventoryUsage).toBe(true);
    expect(observedTreeDepletion).toBe(true);

    const telemetry = mechanism.getTelemetrySnapshot();
    const manipulatorTelemetry = telemetry.values['arm.manipulator']?.lastGather;
    const lastGather =
      manipulatorTelemetry && typeof manipulatorTelemetry.value === 'object'
        ? (manipulatorTelemetry.value as { type?: string | null; harvested?: number | null } | null)
        : null;
    expect(lastGather?.type).toBe('log');

    const droppedLogs = mechanism.resourceField
      .list()
      .filter((node) => node.type === 'log' && node.quantity > 0);
    expect(droppedLogs.length).toBeGreaterThan(0);
  });

  it('stores scan hit positions in memory for later targeting', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);
    const scanFilter = 'silicate-crystal';
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'scan',
          duration: createNumberLiteralBinding(0.25, { label: 'Test → scan duration' }),
          filter: scanFilter,
          sourceBlockId: 'test-scan-memory',
        },
      ],
    };

    const originalInvoke = mechanism.invokeAction.bind(mechanism);
    const customHit = {
      id: 'custom-node-42',
      type: 'silicate-crystal',
      quantity: 18,
      distance: 96,
      position: { x: 75, y: -45 },
    } as const;
    const invokeSpy = vi.spyOn(mechanism, 'invokeAction');
    invokeSpy.mockImplementation((moduleId, actionName, payload) => {
      if (moduleId === 'sensor.survey' && actionName === 'scan') {
        return {
          status: 'ok',
          filter: scanFilter,
          resources: {
            filter: scanFilter,
            hits: [customHit],
            total: 1,
          },
        };
      }
      return originalInvoke(moduleId, actionName, payload);
    });

    runner.load(program);
    runner.update(0.25);
    mechanism.tick(0.25);

    const scanMemory = (runner as unknown as {
      scanMemory: { filter: string | null; hits: Array<{
        id: string | null;
        type: string;
        quantity: number;
        distance: number;
        position: { x: number; y: number } | null;
      }> } | null;
    }).scanMemory;

    expect(scanMemory).not.toBeNull();
    expect(scanMemory?.hits).toHaveLength(1);
    expect(scanMemory?.hits[0]).toEqual(
      expect.objectContaining({
        id: customHit.id,
        type: customHit.type,
        quantity: customHit.quantity,
        distance: customHit.distance,
        position: expect.objectContaining(customHit.position),
      }),
    );

    invokeSpy.mockRestore();
  });

  it('steers towards the most recent scan hit when executing move-to instructions', () => {
    const mechanism = new MechanismChassis({ state: { orientation: Math.PI / 2 } });
    for (const moduleId of DEFAULT_MODULE_LOADOUT) {
      mechanism.attachModule(createModuleInstance(moduleId));
    }

    const runner = new BlockProgramRunner(mechanism);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'scan',
          duration: createNumberLiteralBinding(1, { label: 'Test → scan duration' }),
          filter: null,
          sourceBlockId: 'test-steer-scan',
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
          sourceBlockId: 'test-steer-move-to',
        },
      ],
    };

    const actionSpy = vi.spyOn(mechanism, 'invokeAction');

    runner.load(program);
    runner.update(0.5);
    mechanism.tick(0.5);
    runner.update(0.5);

    const node = mechanism.resourceField.list().find((candidate) => candidate.id === 'node-silicate-1');
    if (!node) {
      throw new Error('Expected the default silicate node to be present.');
    }

    const beforeState = mechanism.getStateSnapshot();
    const beforeDistance = Math.hypot(
      node.position.x - beforeState.position.x,
      node.position.y - beforeState.position.y,
    );

    for (let i = 0; i < 8; i += 1) {
      runner.update(0.25);
      mechanism.tick(0.25);
    }

    const afterState = mechanism.getStateSnapshot();
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
    const mechanism = createMechanism();
    mechanism.inventory.store('ferrous-ore', 6);
    mechanism.inventory.store('silicate-crystal', 3);

    const runner = new BlockProgramRunner(mechanism);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'deposit',
          duration: createNumberLiteralBinding(1, { label: 'Test → deposit duration' }),
          sourceBlockId: 'test-deposit',
        },
      ],
    };

    runner.load(program);
    runner.update(1);
    mechanism.tick(1);

    const inventoryAfter = mechanism.getInventorySnapshot();
    expect(inventoryAfter.used).toBe(1);
    expect(inventoryAfter.entries).toEqual([]);

    const storageSnapshot = mechanism.getStorageSnapshot();
    const baseBox = storageSnapshot.boxes.find((box) => box.id === DEFAULT_STORAGE_BOX_ID);
    expect(baseBox).toBeDefined();
    expect(baseBox?.used).toBeGreaterThanOrEqual(9);
    expect(
      baseBox?.contents.find((entry) => entry.resource === 'ferrous-ore')?.quantity ?? 0,
    ).toBeGreaterThanOrEqual(6);
    expect(
      baseBox?.contents.find((entry) => entry.resource === 'silicate-crystal')?.quantity ?? 0,
    ).toBeGreaterThanOrEqual(3);

    const mechanismState = mechanism.getStateSnapshot();
    const nodes = mechanism.resourceField.list();
    const nearbyNodes = nodes.filter((node) => {
      const dx = node.position.x - mechanismState.position.x;
      const dy = node.position.y - mechanismState.position.y;
      return Math.hypot(dx, dy) <= 1;
    });
    expect(nearbyNodes.length).toBe(0);
  });

  it('stores and withdraws resources when executing storage instructions', () => {
    const mechanism = createMechanism();
    mechanism.inventory.store('ferrous-ore', 7);
    mechanism.inventory.store('silicate-crystal', 2);

    const runner = new BlockProgramRunner(mechanism);
    const emptyStringLiteral = (label: string): StringLiteralValue => ({
      value: '',
      source: 'default',
      label,
    });
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'store-storage',
          duration: createNumberLiteralBinding(0.5, { label: 'Test → store duration' }),
          boxId: emptyStringLiteral('Test → store box'),
          resource: emptyStringLiteral('Test → store resource'),
          amount: createNumberLiteralBinding(0, { label: 'Test → store amount' }),
          sourceBlockId: 'test-store-storage',
        },
        {
          kind: 'withdraw-storage',
          duration: createNumberLiteralBinding(0.5, { label: 'Test → withdraw duration' }),
          boxId: { value: DEFAULT_STORAGE_BOX_ID, source: 'user', label: 'Test → withdraw box' },
          resource: { value: 'ferrous-ore', source: 'user', label: 'Test → withdraw resource' },
          amount: createNumberLiteralBinding(4, { label: 'Test → withdraw amount' }),
          sourceBlockId: 'test-withdraw-storage',
        },
      ],
    };

    runner.load(program);
    runner.update(0.5);
    mechanism.tick(0.5);
    runner.update(0.5);
    mechanism.tick(0.5);

    const inventorySnapshot = mechanism.getInventorySnapshot();
    expect(
      inventorySnapshot.entries.find((entry) => entry.resource === 'ferrous-ore')?.quantity ?? 0,
    ).toBeGreaterThanOrEqual(4);
    expect(
      inventorySnapshot.entries.find((entry) => entry.resource === 'silicate-crystal'),
    ).toBeUndefined();

    const storageSnapshot = mechanism.getStorageSnapshot();
    const baseBox = storageSnapshot.boxes.find((box) => box.id === DEFAULT_STORAGE_BOX_ID);
    expect(baseBox?.used).toBeGreaterThanOrEqual(5);
    expect(
      baseBox?.contents.find((entry) => entry.resource === 'ferrous-ore')?.quantity ?? 0,
    ).toBeLessThanOrEqual(3);

    const telemetry = mechanism.getTelemetrySnapshot().values['arm.manipulator'];
    const lastTransfer = telemetry?.lastStorageTransfer.value as
      | { type: string; status: string; totalTransferred: number }
      | null;
    expect(lastTransfer?.type).toBe('withdraw');
    expect(lastTransfer?.totalTransferred).toBeGreaterThan(0);
  });

  it('loops gather instructions until the targeted node is depleted', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);
    const availableNodes = mechanism.resourceField.list();
    const mechanismState = mechanism.getStateSnapshot();
    const targetNode = availableNodes.reduce((closest, node) => {
      if (!closest) {
        return node;
      }
      const dx = node.position.x - mechanismState.position.x;
      const dy = node.position.y - mechanismState.position.y;
      const distance = Math.hypot(dx, dy);
      const closestDx = closest.position.x - mechanismState.position.x;
      const closestDy = closest.position.y - mechanismState.position.y;
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
              sourceBlockId: 'test-loop-gather',
            },
          ],
          sourceBlockId: 'test-loop',
        },
      ],
    };

    const actionSpy = vi.spyOn(mechanism, 'invokeAction');
    if (!targetNode) {
      throw new Error('Expected at least one resource node for loop test.');
    }

    runner.load(program);

    let safety = 0;
    while (true) {
      const quantity = mechanism.resourceField.list().find((node) => node.id === targetNode.id)?.quantity ?? 0;
      if (quantity <= 0) {
        break;
      }
      safety += 1;
      runner.update(1.5);
      mechanism.tick(1.5);
      if (safety > 12) {
        break;
      }
    }

    const finalNode = mechanism.resourceField.list().find((node) => node.id === targetNode.id);
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
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);
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
              sourceBlockId: 'test-counted-move',
            },
          ],
          sourceBlockId: 'test-counted-loop',
        },
      ],
    };

    const actionSpy = vi.spyOn(mechanism, 'invokeAction');

    runner.load(program);
    runner.update(3);
    mechanism.tick(3);

    const moveCalls = actionSpy.mock.calls.filter(([, actionName]) => actionName === 'setLinearVelocity');
    expect(moveCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('branches based on signal telemetry', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);
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
              sourceBlockId: 'test-branch-true',
            },
          ],
          whenFalse: [
            {
              kind: 'status-set',
              duration: createNumberLiteralBinding(0, { label: 'Branch → false duration' }),
              value: createBooleanLiteralBinding(false, { label: 'Branch → false value' }),
              sourceBlockId: 'test-branch-false',
            },
          ],
          sourceBlockId: 'test-branch',
        },
      ],
    };

    runner.load(program);
    runner.update(0.1);
    mechanism.tick(0.1);
    let telemetry = mechanism.getTelemetrySnapshot();
    expect(telemetry.values['status.signal']?.active.value).toBe(false);

    mechanism.invokeAction('status.signal', 'setStatus', { value: true });
    runner.load(program);
    runner.update(0.1);
    mechanism.tick(0.1);
    telemetry = mechanism.getTelemetrySnapshot();
    expect(telemetry.values['status.signal']?.active.value).toBe(true);
  });

  it('exposes debug state including current instruction and frame stack', () => {
    const mechanism = createMechanism();
    const runner = new BlockProgramRunner(mechanism);
    const program: CompiledProgram = {
      instructions: [
        {
          kind: 'move',
          duration: createNumberLiteralBinding(1, { label: 'Debug → move duration' }),
          speed: createNumberLiteralBinding(20, { label: 'Debug → move speed' }),
          sourceBlockId: 'debug-move',
        },
        {
          kind: 'loop',
          mode: 'forever',
          instructions: [
            {
              kind: 'turn',
              duration: createNumberLiteralBinding(0.5, { label: 'Debug → turn duration' }),
              angularVelocity: createNumberLiteralBinding(Math.PI, { label: 'Debug → turn rate' }),
              sourceBlockId: 'debug-turn',
            },
          ],
          sourceBlockId: 'debug-loop',
        },
      ],
    };

    runner.load(program);

    const initialDebug = runner.getDebugState();
    expect(initialDebug.status).toBe('running');
    expect(initialDebug.program).toBe(program);
    expect(initialDebug.currentInstruction?.kind).toBe('move');
    expect(initialDebug.currentInstruction?.sourceBlockId).toBe('debug-move');
    expect(initialDebug.frames).toHaveLength(1);
    expect(initialDebug.frames[0]).toMatchObject({ kind: 'sequence', index: 0, length: 2 });

    runner.update(1.1);
    mechanism.tick(1.1);

    const loopDebug = runner.getDebugState();
    expect(loopDebug.currentInstruction?.kind).toBe('turn');
    expect(loopDebug.currentInstruction?.sourceBlockId).toBe('debug-turn');
    expect(loopDebug.frames).toEqual([
      expect.objectContaining({ kind: 'sequence', index: 2, length: 2 }),
      expect.objectContaining({ kind: 'loop', index: 0, length: 1 }),
    ]);
  });
});
