import { describe, expect, it } from 'vitest';
import { RobotChassis } from '../RobotChassis.js';
import { RobotModule } from '../RobotModule.js';

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
  constructor({ id, index, priority, velocityX }) {
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

  update({ port }) {
    port.requestActuator(
      'movement.linear',
      { x: this.velocityX, y: 0 },
      this.priority,
    );
  }
}

class TelemetryCoolingModule extends RobotModule {
  constructor() {
    super({
      id: 'support.cooling',
      title: 'Cooling Manifold',
      requires: ['power.core'],
      provides: ['support.cooling'],
      attachment: { slot: 'support', index: 0 },
    });
  }

  onAttach(port) {
    this.port = port;
    port.publishValue('temperature', 5, { unit: 'celsius' });
    port.registerAction('cool', (payload, context) => {
      const amount = Number.isFinite(payload?.amount) ? payload.amount : 1;
      const current = this.port.getValue('temperature') ?? 0;
      const nextValue = Math.max(0, current - amount);
      this.port.updateValue('temperature', nextValue);
      context.requestActuator('movement.angular', { value: amount * 0.1 }, 5);
      return nextValue;
    }, { label: 'Coolant purge' });
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
