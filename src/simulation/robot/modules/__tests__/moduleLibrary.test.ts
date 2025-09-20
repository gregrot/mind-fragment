import { describe, expect, it } from 'vitest';
import { RobotChassis } from '../../RobotChassis';
import {
  MODULE_LIBRARY,
  DEFAULT_MODULE_LOADOUT,
  createModuleInstance,
  getModuleBlueprint,
} from '../moduleLibrary';

describe('module library definitions', () => {
  it('provides blueprint metadata for the MVP modules', () => {
    expect(MODULE_LIBRARY).toHaveLength(5);
    expect(DEFAULT_MODULE_LOADOUT).toEqual([
      'core.movement',
      'arm.manipulator',
      'storage.cargo',
      'fabricator.basic',
      'sensor.survey',
    ]);

    for (const moduleId of DEFAULT_MODULE_LOADOUT) {
      const blueprint = getModuleBlueprint(moduleId);
      expect(blueprint).not.toBeNull();
      expect(blueprint?.parameters.length).toBeGreaterThan(0);
      expect(blueprint?.actions.length).toBeGreaterThan(0);
      expect(blueprint?.telemetry.length).toBeGreaterThan(0);
    }
  });

  it('instantiates modules that publish telemetry and expose actions', () => {
    const chassis = new RobotChassis();
    const modules = DEFAULT_MODULE_LOADOUT.map((id) => createModuleInstance(id));
    modules.forEach((module) => chassis.attachModule(module));

    const telemetry = chassis.getTelemetrySnapshot();

    const movementValues = telemetry.values['core.movement'];
    const movementActions = telemetry.actions['core.movement'];
    expect(movementValues).toBeDefined();
    expect(movementActions).toBeDefined();
    const maxLinear = movementValues?.maxLinearSpeed.value as number;
    expect(maxLinear).toBeGreaterThan(0);
    expect(movementActions?.setLinearVelocity.metadata.label).toBe(
      'Set linear velocity',
    );
    const manipulatorValues = telemetry.values['arm.manipulator'];
    const manipulatorActions = telemetry.actions['arm.manipulator'];
    const gripStrength = manipulatorValues?.gripStrength.value as number;
    expect(gripStrength).toBeGreaterThan(0);
    expect(manipulatorActions?.grip.metadata.label).toBe('Grip target');

    const cargoValues = telemetry.values['storage.cargo'];
    const cargoActions = telemetry.actions['storage.cargo'];
    const initialAvailable = cargoValues?.available.value as number;
    expect(initialAvailable).toBeGreaterThan(0);
    expect(cargoActions?.storeResource.metadata.label).toBe('Store resource');

    const fabricatorValues = telemetry.values['fabricator.basic'];
    const fabricatorActions = telemetry.actions['fabricator.basic'];
    const initialQueueLength = fabricatorValues?.queueLength.value as number;
    expect(initialQueueLength).toBe(0);
    expect(fabricatorActions?.queueRecipe.metadata.label).toBe('Queue recipe');

    const scannerValues = telemetry.values['sensor.survey'];
    const scannerActions = telemetry.actions['sensor.survey'];
    const scanRange = scannerValues?.scanRange.value as number;
    expect(scanRange).toBeGreaterThan(0);
    expect(scannerActions?.scan.metadata.label).toBe('Sweep area');

    const linearResult = chassis.invokeAction('core.movement', 'setLinearVelocity', { x: 200, y: 0 }) as {
      x: number;
      y: number;
    };
    expect(linearResult.x).toBeLessThanOrEqual(maxLinear);

    const angularResult = chassis.invokeAction('core.movement', 'setAngularVelocity', {
      value: Math.PI,
    }) as number;
    const maxAngular = movementValues?.maxAngularSpeed.value as number;
    expect(Math.abs(angularResult)).toBeLessThanOrEqual(maxAngular);

    const gripResult = chassis.invokeAction('arm.manipulator', 'grip', { item: 'glyph' }) as {
      item: string | null;
      operations: number;
    };
    expect(gripResult.item).toBe('glyph');

    const queueResult = chassis.invokeAction('fabricator.basic', 'queueRecipe', {
      recipe: 'alloy-ingot',
      duration: 0.6,
    }) as { recipe: string; queueLength: number };
    expect(queueResult.queueLength).toBe(1);

    const scanResult = chassis.invokeAction('sensor.survey', 'scan', {
      resourceType: 'ferrous-ore',
    }) as {
      status: string;
      resources: { hits: Array<{ id: string; type: string }> };
    };
    expect(scanResult.status).toBe('ok');
    expect(scanResult.resources.hits.length).toBeGreaterThan(0);
    const resourceHit = scanResult.resources.hits[0];
    expect(resourceHit.type).toBe('ferrous-ore');

    const gatherResult = chassis.invokeAction('arm.manipulator', 'gatherResource', {
      nodeId: resourceHit.id,
      amount: 10,
    }) as {
      status: string;
      harvested: number;
      type: string | null;
      nodeId: string;
    };
    expect(['ok', 'depleted', 'partial']).toContain(gatherResult.status);
    expect(gatherResult.harvested).toBeGreaterThan(0);
    expect(gatherResult.type).toBe('ferrous-ore');

    chassis.tick(0.5);
    chassis.tick(0.5);

    const refreshedTelemetry = chassis.getTelemetrySnapshot();
    const movementTelemetry = refreshedTelemetry.values['core.movement'];
    expect(movementTelemetry).toBeDefined();
    const travelled = movementTelemetry?.distanceTravelled.value as number;
    expect(travelled).toBeGreaterThan(0);
    const lastCommand = movementTelemetry?.lastCommand.value as { type: string };
    expect(lastCommand.type).toBe('angular');

    const manipulatorTelemetry = refreshedTelemetry.values['arm.manipulator'];
    expect(manipulatorTelemetry?.heldItem.value).toBe('glyph');
    const totalHarvested = manipulatorTelemetry?.totalHarvested.value as number;
    expect(totalHarvested).toBeGreaterThanOrEqual(gatherResult.harvested);

    const fabricatorTelemetry = refreshedTelemetry.values['fabricator.basic'];
    const remainingQueue = fabricatorTelemetry?.queueLength.value as number;
    expect(remainingQueue).toBe(0);
    const lastCompleted = fabricatorTelemetry?.lastCompleted.value as { recipe: string };
    expect(lastCompleted.recipe).toBe('alloy-ingot');

    const cargoTelemetry = refreshedTelemetry.values['storage.cargo'];
    const cargoContents = cargoTelemetry?.contents.value as Array<{ resource: string; quantity: number }>;
    expect(Array.isArray(cargoContents)).toBe(true);
    expect(
      cargoContents.some((entry) => entry.resource === 'ferrous-ore' && entry.quantity >= gatherResult.harvested),
    ).toBe(true);

    const withdrawResult = chassis.invokeAction('storage.cargo', 'withdrawResource', {
      resource: 'ferrous-ore',
      amount: 2,
    }) as { status: string; withdrawn: number };
    expect(['emptied', 'partial', 'empty']).toContain(withdrawResult.status);
    expect(withdrawResult.withdrawn).toBeGreaterThanOrEqual(0);

    const scannerTelemetry = refreshedTelemetry.values['sensor.survey'];
    expect(scannerTelemetry?.lastScan.value).not.toBeNull();
    const cooldownRemaining = scannerTelemetry?.cooldownRemaining.value as number;
    expect(cooldownRemaining >= 0).toBe(true);

    const cooldownResult = chassis.invokeAction('sensor.survey', 'scan', {}) as Record<string, unknown>;
    expect(cooldownResult.status).toBe('cooldown');

    chassis.detachModule('sensor.survey');
    expect(() => chassis.invokeAction('sensor.survey', 'scan', {})).toThrow();
  });
});
