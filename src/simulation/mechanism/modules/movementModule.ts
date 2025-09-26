import { MechanismModule } from '../MechanismModule';
import type { ModulePort } from '../moduleBus';
import type { ModuleActionContext, ModuleUpdateContext } from '../MechanismChassis';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export interface MovementModuleOptions {
  maxLinearSpeed?: number;
  maxAngularSpeed?: number;
}

export class MovementModule extends MechanismModule {
  private readonly defaultMaxLinearSpeed: number;
  private readonly defaultMaxAngularSpeed: number;
  private port: ModulePort | null = null;
  private distanceTravelled = 0;
  private commandSequence = 0;

  constructor({ maxLinearSpeed = 120, maxAngularSpeed = Math.PI }: MovementModuleOptions = {}) {
    super({
      id: 'core.movement',
      title: 'Locomotion Thrusters Mk1',
      provides: ['movement.linear', 'movement.angular'],
      attachment: { slot: 'core', index: 0 },
      capacityCost: 2,
    });

    this.defaultMaxLinearSpeed = maxLinearSpeed;
    this.defaultMaxAngularSpeed = maxAngularSpeed;
  }

  override onAttach(port: ModulePort): void {
    this.port = port;
    this.distanceTravelled = 0;
    this.commandSequence = 0;

    port.publishValue('maxLinearSpeed', this.defaultMaxLinearSpeed, {
      label: 'Max linear speed',
      unit: 'units/s',
    });
    port.publishValue('maxAngularSpeed', this.defaultMaxAngularSpeed, {
      label: 'Max rotational speed',
      unit: 'rad/s',
    });
    port.publishValue('distanceTravelled', 0, {
      label: 'Distance travelled',
      unit: 'units',
    });
    port.publishValue(
      'lastCommand',
      { type: 'idle', sequence: 0 },
      {
        label: 'Last command',
        summary: 'Records the latest locomotion request applied to the chassis.',
      },
    );

    port.registerAction(
      'setLinearVelocity',
      (payload, context) => this.handleLinearCommand(payload, context),
      {
        label: 'Set linear velocity',
        summary: 'Accelerate using the thruster array while respecting the configured maximum.',
        parameters: [
          { key: 'x', label: 'Velocity X', unit: 'units/s' },
          { key: 'y', label: 'Velocity Y', unit: 'units/s' },
        ],
      },
    );

    port.registerAction(
      'setAngularVelocity',
      (payload, context) => this.handleAngularCommand(payload, context),
      {
        label: 'Set angular velocity',
        summary: 'Rotate the chassis at a bounded rate to reorient the mechanism.',
        parameters: [{ key: 'value', label: 'Angular velocity', unit: 'rad/s' }],
      },
    );
  }

  override onDetach(): void {
    this.port?.unregisterAction('setLinearVelocity');
    this.port?.unregisterAction('setAngularVelocity');
    this.port = null;
  }

  override update({ stepSeconds, state }: ModuleUpdateContext): void {
    if (!this.port) {
      return;
    }
    const velocity = state.velocity.linear;
    const distance = Math.hypot(velocity.x, velocity.y) * stepSeconds;
    if (distance <= 0) {
      return;
    }
    this.distanceTravelled += distance;
    this.port.updateValue('distanceTravelled', roundTo(this.distanceTravelled, 3));
  }

  private handleLinearCommand(payload: unknown, context: unknown): { x: number; y: number } {
    if (!this.port) {
      return { x: 0, y: 0 };
    }
    const typedPayload = (payload ?? {}) as { x?: number; y?: number };
    const typedContext = context as ModuleActionContext;

    const configuredMax = this.port.getValue<number>('maxLinearSpeed') ?? this.defaultMaxLinearSpeed;
    const requestedX = Number.isFinite(typedPayload.x) ? (typedPayload.x as number) : 0;
    const requestedY = Number.isFinite(typedPayload.y) ? (typedPayload.y as number) : 0;

    const magnitude = Math.hypot(requestedX, requestedY);
    let resultX = requestedX;
    let resultY = requestedY;
    if (magnitude > configuredMax && magnitude > 0) {
      const scale = configuredMax / magnitude;
      resultX *= scale;
      resultY *= scale;
    }

    typedContext.requestActuator('movement.linear', { x: resultX, y: resultY }, 5);

    this.commandSequence += 1;
    this.port.updateValue('lastCommand', {
      type: 'linear',
      vector: { x: roundTo(resultX, 3), y: roundTo(resultY, 3) },
      sequence: this.commandSequence,
    });

    return { x: resultX, y: resultY };
  }

  private handleAngularCommand(payload: unknown, context: unknown): number {
    if (!this.port) {
      return 0;
    }
    const typedPayload = (payload ?? {}) as { value?: number };
    const typedContext = context as ModuleActionContext;

    const configuredMax = this.port.getValue<number>('maxAngularSpeed') ?? this.defaultMaxAngularSpeed;
    const requested = Number.isFinite(typedPayload.value) ? (typedPayload.value as number) : 0;
    const bounded = clamp(requested, -configuredMax, configuredMax);

    typedContext.requestActuator('movement.angular', { value: bounded }, 6);

    this.commandSequence += 1;
    this.port.updateValue('lastCommand', {
      type: 'angular',
      value: roundTo(bounded, 3),
      sequence: this.commandSequence,
    });

    return bounded;
  }
}
