import { describe, expect, it } from 'vitest';
import { RobotChassis, type ModuleActionContext, type ModuleUpdateContext } from '../RobotChassis';
import { RobotModule } from '../RobotModule';
import type { ModulePort } from '../moduleBus';
import type { ChassisSnapshot } from '../RobotChassis';

interface LinearMovementOptions {
  id: string;
  index: number;
  priority: number;
  velocityX: number;
}

class PowerCoreModule extends RobotModule {
  constructor() {
    super({
      id: 'core.power',
      title: 'Power Core',
      provides: ['power.core'],
      attachment: { slot: 'core', index: 0 },
    });
  }
}

class LinearMovementModule extends RobotModule {
  private readonly priority: number;
  private readonly velocityX: number;

  constructor({ id, index, priority, velocityX }: LinearMovementOptions) {
    super({
      id,
      title: `Linear Movement ${id}`,
      provides: ['movement.linear'],
      requires: ['power.core'],
      attachment: { slot: 'extension', index },
    });
    this.priority = priority;
    this.velocityX = velocityX;
  }

  override update({ port }: ModuleUpdateContext): void {
    port.requestActuator(
      'movement.linear',
      { x: this.velocityX, y: 0 },
      this.priority,
    );
  }
}

class TelemetryCoolingModule extends RobotModule {
  private port: ModulePort | null = null;

  constructor() {
    super({
      id: 'support.cooling',
      title: 'Cooling Manifold',
      requires: ['power.core'],
      provides: ['support.cooling'],
      attachment: { slot: 'support', index: 0 },
    });
  }

  override onAttach(port: ModulePort): void {
    this.port = port;
    port.publishValue('temperature', 5, { unit: 'celsius' });
    port.registerAction('cool', (payload, context) => {
      const typedPayload = payload as { amount?: number } | undefined;
      const typedContext = context as ModuleActionContext;
      const amount = Number.isFinite(typedPayload?.amount) ? typedPayload!.amount! : 1;
      const current = this.port?.getValue<number>('temperature') ?? 0;
      const nextValue = Math.max(0, current - amount);
      this.port?.updateValue('temperature', nextValue);
      typedContext.requestActuator('movement.angular', { value: amount * 0.1 }, 5);
      return nextValue;
    }, { label: 'Coolant purge' });
  }

  override onDetach(): void {
    this.port = null;
  }
}

describe('RobotChassis state model', () => {
  it('exposes the robot state with position, orientation, velocity, energy, and heat', () => {
    const chassis = new RobotChassis({
      state: {
        position: { x: 10, y: -5 },
        orientation: Math.PI / 2,
        velocity: { linear: { x: 1, y: 2 }, angular: 0.5 },
        energy: { current: 40, max: 100 },
        heat: { current: 20, max: 50 },
      },
    });

    const snapshot = chassis.getStateSnapshot();
    expect(snapshot.position).toEqual({ x: 10, y: -5 });
    expect(snapshot.orientation).toBeCloseTo(Math.PI / 2);
    expect(snapshot.velocity.linear).toEqual({ x: 1, y: 2 });
    expect(snapshot.velocity.angular).toBeCloseTo(0.5);
    expect(snapshot.energy).toEqual({ current: 40, max: 100 });
    expect(snapshot.heat).toEqual({ current: 20, max: 50 });
  });
});

describe('Module stack rules', () => {
  it('enforces capacity, attachment order, and dependencies', () => {
    const chassis = new RobotChassis({ capacity: 3 });
    const power = new PowerCoreModule();
    const mover = new RobotModule({
      id: 'move.basic',
      title: 'Basic Movement',
      provides: ['movement.basic'],
      requires: ['power.core'],
      attachment: { slot: 'core', index: 1 },
    });

    chassis.attachModule(power);
    chassis.attachModule(mover);

    expect(chassis.moduleStack.hasCapability('movement.basic')).toBe(true);

    const missingDependency = new RobotModule({
      id: 'scanner.vision',
      title: 'Vision Scanner',
      requires: ['power.aux'],
      attachment: { slot: 'sensor', index: 0 },
    });

    expect(() => chassis.attachModule(missingDependency)).toThrow(/power\.aux/);

    const filler = new RobotModule({
      id: 'support.frame',
      title: 'Support Frame',
      attachment: { slot: 'support', index: 0 },
    });

    chassis.attachModule(filler);

    const overCapacity = new RobotModule({
      id: 'arm.heavy',
      title: 'Heavy Armature',
      provides: ['manipulator.heavy'],
      requires: ['power.core'],
      attachment: { slot: 'extension', index: 0 },
    });

    expect(() => chassis.attachModule(overCapacity)).toThrow(/capacity/);
    expect(() => chassis.detachModule('core.power')).toThrow(/required capability/);
  });
});

describe('Module messaging and actuator resolution', () => {
  it('allows modules to publish data, expose actions, and resolves actuator conflicts', () => {
    const chassis = new RobotChassis({ capacity: 5 });
    const power = new PowerCoreModule();
    const cooling = new TelemetryCoolingModule();
    const moverA = new LinearMovementModule({
      id: 'move.alpha',
      index: 0,
      priority: 1,
      velocityX: 5,
    });
    const moverB = new LinearMovementModule({
      id: 'move.beta',
      index: 1,
      priority: 1,
      velocityX: -3,
    });

    chassis.attachModule(power);
    chassis.attachModule(moverA);
    chassis.attachModule(moverB);
    chassis.attachModule(cooling);

    const telemetry = chassis.getTelemetrySnapshot();
    expect(telemetry.values['support.cooling'].temperature.value).toBe(5);
    expect(telemetry.actions['support.cooling'].cool.metadata.label).toBe('Coolant purge');

    const result = chassis.invokeAction('support.cooling', 'cool', { amount: 2 });
    expect(result).toBe(3);

    chassis.tick(1);
    const stateAfterTick = chassis.getStateSnapshot();
    expect(stateAfterTick.velocity.angular).toBeCloseTo(0.2);
    expect(stateAfterTick.velocity.linear.x).toBe(5);

    chassis.tick(1);
    const stateAfterSecondTick = chassis.getStateSnapshot();
    expect(stateAfterSecondTick.position.x).toBeCloseTo(10);
    expect(stateAfterSecondTick.orientation).toBeGreaterThan(stateAfterTick.orientation);
  });
});

describe('Chassis slot schema integration', () => {
  it('exposes slot schema snapshots with default metadata', () => {
    const chassis = new RobotChassis({ capacity: 6 });

    const snapshot = chassis.getSlotSchemaSnapshot();
    expect(snapshot.capacity).toBe(6);
    expect(snapshot.slots).toEqual([
      {
        id: 'core-0',
        index: 0,
        occupantId: null,
        metadata: { stackable: false, locked: false, moduleSubtype: 'Core' },
      },
      {
        id: 'extension-0',
        index: 0,
        occupantId: null,
        metadata: { stackable: false, locked: false, moduleSubtype: 'Extension' },
      },
      {
        id: 'sensor-0',
        index: 0,
        occupantId: null,
        metadata: { stackable: false, locked: false, moduleSubtype: 'Sensor' },
      },
    ]);
  });

  it('notifies listeners when slot occupancy changes', () => {
    const chassis = new RobotChassis({ capacity: 4 });
    const power = new PowerCoreModule();
    const cooling = new TelemetryCoolingModule();

    const snapshots: ChassisSnapshot[] = [];
    const unsubscribe = chassis.subscribeSlots((snapshot) => {
      snapshots.push(snapshot);
    });

    expect(snapshots).toHaveLength(1);
    const initial = snapshots[0]!;
    expect(initial.slots.find((slot) => slot.id === 'core-0')?.occupantId).toBeNull();

    chassis.attachModule(power);
    const afterPower = snapshots[snapshots.length - 1]!;
    expect(afterPower.slots.find((slot) => slot.id === 'core-0')?.occupantId).toBe('core.power');

    chassis.attachModule(cooling);
    const afterCooling = snapshots[snapshots.length - 1]!;
    const supportSlot = afterCooling.slots.find((slot) => slot.id === 'support-0');
    expect(supportSlot?.occupantId).toBe('support.cooling');
    expect(supportSlot?.metadata).toEqual({ stackable: false, locked: false, moduleSubtype: 'Support' });

    chassis.detachModule('support.cooling');
    const afterDetach = snapshots[snapshots.length - 1]!;
    expect(afterDetach.slots.find((slot) => slot.id === 'support-0')?.occupantId).toBeNull();

    unsubscribe();
  });
});
