import { describe, expect, it, vi } from 'vitest';
import { MechanismChassis } from '../../MechanismChassis';
import { CargoHoldModule } from '../cargoHoldModule';
import { ManipulationModule } from '../manipulationModule';

const createChassis = (): MechanismChassis => {
  const mechanism = new MechanismChassis();
  mechanism.attachModule(new CargoHoldModule({ capacity: 200 }));
  mechanism.attachModule(new ManipulationModule());
  return mechanism;
};

describe('ManipulationModule dropResource', () => {
  it('drops all inventory stacks and updates telemetry', () => {
    const mechanism = createChassis();
    mechanism.inventory.store('ferrous-ore', 10);
    mechanism.inventory.store('silicate-crystal', 5);

    const result = mechanism.invokeAction('arm.manipulator', 'dropResource', {}) as {
      status: string;
      totalDropped: number;
      resources: Array<{ resource: string; dropped: number; remaining: number }>;
    };

    expect(result.status).toBe('dropped');
    expect(result.totalDropped).toBe(15);
    expect(result.resources).toHaveLength(2);

    const inventoryAfter = mechanism.getInventorySnapshot();
    expect(inventoryAfter.used).toBe(1);
    expect(inventoryAfter.entries).toEqual([]);
    expect(inventoryAfter.equipment).toEqual([
      expect.objectContaining({ itemId: 'axe', slotId: 'inventory-0' }),
    ]);

    const telemetry = mechanism.getTelemetrySnapshot().values['arm.manipulator'];
    expect(telemetry?.totalDeposited.value).toBe(15);
    expect(telemetry?.operationsCompleted.value).toBe(1);
    const lastDrop = telemetry?.lastDrop.value as { status: string; totalDropped: number } | null;
    expect(lastDrop?.status).toBe('dropped');
    expect(lastDrop?.totalDropped).toBe(15);

    const nodes = mechanism.resourceField.list();
    const nearOrigin = nodes.filter((node) => Math.hypot(node.position.x, node.position.y) <= 1);
    expect(nearOrigin.length).toBeGreaterThanOrEqual(2);
    expect(
      nearOrigin.some((node) => node.type === 'ferrous-ore' && node.quantity >= 10),
    ).toBe(true);
    expect(
      nearOrigin.some((node) => node.type === 'silicate-crystal' && node.quantity >= 5),
    ).toBe(true);
  });

  it('supports targeted partial drops', () => {
    const mechanism = createChassis();
    mechanism.inventory.store('ferrous-ore', 10);

    const result = mechanism.invokeAction('arm.manipulator', 'dropResource', {
      resource: 'ferrous-ore',
      amount: 4,
    }) as {
      status: string;
      totalDropped: number;
      resources: Array<{ remaining: number; dropped: number }>;
    };

    expect(result.status).toBe('partial');
    expect(result.totalDropped).toBe(4);
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0].remaining).toBe(6);

    const inventoryAfter = mechanism.getInventorySnapshot();
    expect(inventoryAfter.used).toBe(7);
    expect(inventoryAfter.entries).toEqual([{ resource: 'ferrous-ore', quantity: 6 }]);

    const telemetry = mechanism.getTelemetrySnapshot().values['arm.manipulator'];
    expect(telemetry?.totalDeposited.value).toBe(4);
    const lastDrop = telemetry?.lastDrop.value as {
      status: string;
      totalDropped: number;
      resources: Array<{ remaining: number }>;
    } | null;
    expect(lastDrop?.status).toBe('partial');
    expect(lastDrop?.totalDropped).toBe(4);
    expect(lastDrop?.resources[0].remaining).toBe(6);
  });
});

describe('ManipulationModule useInventoryItem', () => {
  it('rejects empty slots', () => {
    const mechanism = createChassis();
    const hitSpy = vi.spyOn(mechanism.resourceField, 'registerHit');

    const result = mechanism.invokeAction('arm.manipulator', 'useInventoryItem', {
      slot: 1,
      nodeId: 'tree-1',
      target: { x: 12, y: -4 },
    }) as { status: string };

    expect(result.status).toBe('empty-slot');
    expect(hitSpy).not.toHaveBeenCalled();
  });

  it('consumes exactly one hit per call and forwards tool swings', () => {
    const mechanism = createChassis();
    const node = mechanism.resourceField.upsertNode({
      id: 'tree-1',
      type: 'arboreal-node',
      position: { x: 10, y: 5 },
      quantity: 2,
      metadata: { hitPoints: 2, hitsRemaining: 2, requiredTool: 'axe' },
    });

    const hitSpy = vi.spyOn(mechanism.resourceField, 'registerHit');

    const firstResult = mechanism.invokeAction('arm.manipulator', 'useInventoryItem', {
      slot: 0,
      nodeId: node.id,
      target: { x: 14, y: 9 },
    }) as { status: string; remaining: number };

    expect(firstResult.status).toBe('ok');
    expect(firstResult.remaining).toBe(1);
    expect(hitSpy).toHaveBeenCalledTimes(1);
    expect(hitSpy).toHaveBeenLastCalledWith({ nodeId: node.id, toolType: 'axe' });

    hitSpy.mockClear();

    const secondResult = mechanism.invokeAction('arm.manipulator', 'useInventoryItem', {
      slot: 0,
      nodeId: node.id,
      target: { x: 14, y: 9 },
    }) as { status: string; remaining: number };

    expect(secondResult.status).toBe('depleted');
    expect(secondResult.remaining).toBe(0);
    expect(hitSpy).toHaveBeenCalledTimes(1);

    const telemetry = mechanism.getTelemetrySnapshot().values['arm.manipulator'];
    const lastToolUse = telemetry?.lastToolUse.value as
      | { status: string; remaining: number; target: { x: number; y: number } }
      | null;
    expect(lastToolUse?.status).toBe('depleted');
    expect(lastToolUse?.remaining).toBe(0);
    expect(lastToolUse?.target).toEqual({ x: 14, y: 9 });

    const pending = (mechanism as unknown as { pendingActuators: Map<string, unknown[]> }).pendingActuators;
    const toolRequests = pending.get('manipulation.tool') as Array<{ payload: unknown }> | undefined;
    expect(toolRequests).toBeDefined();
    const latestRequest = toolRequests?.[toolRequests.length - 1];
    expect(latestRequest?.payload).toMatchObject({
      slotIndex: 0,
      item: 'axe',
      nodeId: node.id,
      target: { x: 14, y: 9 },
    });
  });
});
