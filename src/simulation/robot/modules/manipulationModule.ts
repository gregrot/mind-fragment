import { RobotModule } from '../RobotModule';
import type { ModulePort } from '../moduleBus';
import type { ModuleActionContext } from '../RobotChassis';

interface GripPayload {
  item?: string;
}

interface ConfigureGripPayload {
  strength?: number;
}

export interface ManipulationModuleOptions {
  gripStrength?: number;
}

export class ManipulationModule extends RobotModule {
  private readonly defaultGripStrength: number;
  private port: ModulePort | null = null;
  private operationsCompleted = 0;

  constructor({ gripStrength = 35 }: ManipulationModuleOptions = {}) {
    super({
      id: 'arm.manipulator',
      title: 'Precision Manipulator Rig',
      provides: ['manipulation.grip'],
      attachment: { slot: 'extension', index: 0 },
      capacityCost: 1,
    });

    this.defaultGripStrength = gripStrength;
  }

  override onAttach(port: ModulePort): void {
    this.port = port;
    this.operationsCompleted = 0;

    port.publishValue('gripStrength', this.defaultGripStrength, {
      label: 'Grip strength',
      unit: 'kN',
    });
    port.publishValue('gripEngaged', false, {
      label: 'Grip engaged',
    });
    port.publishValue('heldItem', null, {
      label: 'Held item',
    });
    port.publishValue('operationsCompleted', 0, {
      label: 'Operations completed',
    });

    port.registerAction(
      'configureGrip',
      (payload) => this.configureGrip(payload),
      {
        label: 'Configure grip strength',
        summary: 'Adjust the manipulator tension to handle fragile or heavy objects.',
        parameters: [{ key: 'strength', label: 'Desired strength', unit: 'kN' }],
      },
    );

    port.registerAction(
      'grip',
      (payload, context) => this.handleGrip(payload, context),
      {
        label: 'Grip target',
        summary: 'Close the manipulator fingers around the supplied item identifier.',
        parameters: [{ key: 'item', label: 'Target item id' }],
      },
    );

    port.registerAction(
      'release',
      () => this.release(),
      {
        label: 'Release',
        summary: 'Open the manipulator and clear the held item.',
      },
    );
  }

  override onDetach(): void {
    this.port?.unregisterAction('configureGrip');
    this.port?.unregisterAction('grip');
    this.port?.unregisterAction('release');
    this.port = null;
  }

  private configureGrip(payload: unknown): number {
    if (!this.port) {
      return this.defaultGripStrength;
    }
    const typedPayload = (payload ?? {}) as ConfigureGripPayload;
    const strength = Number.isFinite(typedPayload.strength)
      ? (typedPayload.strength as number)
      : this.defaultGripStrength;
    const boundedStrength = Math.min(Math.max(strength, 5), 200);
    this.port.updateValue('gripStrength', boundedStrength);
    return boundedStrength;
  }

  private handleGrip(payload: unknown, context: unknown): { item: string | null; operations: number } {
    if (!this.port) {
      return { item: null, operations: this.operationsCompleted };
    }
    const typedPayload = (payload ?? {}) as GripPayload;
    const typedContext = context as ModuleActionContext;
    const item = typedPayload.item ?? 'unknown-sample';

    this.port.updateValue('gripEngaged', true);
    this.port.updateValue('heldItem', item);

    this.operationsCompleted += 1;
    this.port.updateValue('operationsCompleted', this.operationsCompleted);

    typedContext.requestActuator(
      'manipulation.primary',
      { item, gripStrength: this.port.getValue<number>('gripStrength') ?? this.defaultGripStrength },
      3,
    );

    return { item, operations: this.operationsCompleted };
  }

  private release(): { released: boolean; operations: number } {
    if (!this.port) {
      return { released: false, operations: this.operationsCompleted };
    }
    this.port.updateValue('gripEngaged', false);
    this.port.updateValue('heldItem', null);
    return { released: true, operations: this.operationsCompleted };
  }
}
