import { describe, expect, it } from 'vitest';
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
    expect(inventoryAfter.used).toBe(0);

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
    expect(inventoryAfter.used).toBe(6);

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
