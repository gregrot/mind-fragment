import { RobotModule } from '../RobotModule';
import type { ModulePort } from '../moduleBus';
import type { ModuleActionContext } from '../RobotChassis';

interface GripPayload {
  item?: string;
}

interface ConfigureGripPayload {
  strength?: number;
}

interface GatherResourcePayload {
  nodeId?: string;
  amount?: number;
  maxDistance?: number;
}

export interface ManipulationModuleOptions {
  gripStrength?: number;
}

const DEFAULT_GATHER_RANGE = 220;
const DEFAULT_GATHER_AMOUNT = 12;

export class ManipulationModule extends RobotModule {
  private readonly defaultGripStrength: number;
  private port: ModulePort | null = null;
  private operationsCompleted = 0;
  private harvestedTotal = 0;

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
    this.harvestedTotal = 0;

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
    port.publishValue('gatherRange', DEFAULT_GATHER_RANGE, {
      label: 'Gather range',
      unit: 'units',
    });
    port.publishValue('totalHarvested', 0, {
      label: 'Total harvested',
      unit: 'units',
    });
    port.publishValue('lastGather', null, {
      label: 'Last gather result',
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

    port.registerAction(
      'gatherResource',
      (payload, context) => this.gatherResource(payload, context),
      {
        label: 'Gather resource',
        summary: 'Harvest a surveyed node and deposit it into inventory.',
        parameters: [
          { key: 'nodeId', label: 'Resource node id' },
          { key: 'amount', label: 'Desired amount', unit: 'units' },
          { key: 'maxDistance', label: 'Max distance override', unit: 'units' },
        ],
      },
    );
  }

  override onDetach(): void {
    this.port?.unregisterAction('configureGrip');
    this.port?.unregisterAction('grip');
    this.port?.unregisterAction('release');
    this.port?.unregisterAction('gatherResource');
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

  private gatherResource(payload: unknown, context: unknown): Record<string, unknown> {
    if (!this.port) {
      return { status: 'inactive' };
    }

    const typedContext = context as ModuleActionContext;
    const resourceField = typedContext?.utilities?.resourceField;
    const inventory = typedContext?.utilities?.inventory;
    if (!resourceField || !inventory) {
      return { status: 'missing-systems' };
    }

    const typedPayload = (payload ?? {}) as GatherResourcePayload;
    const nodeId = typedPayload.nodeId?.trim();
    if (!nodeId) {
      return { status: 'invalid-node' };
    }

    const configuredRange = this.port.getValue<number>('gatherRange') ?? DEFAULT_GATHER_RANGE;
    const requestedAmount = Number.isFinite(typedPayload.amount)
      ? Math.max(typedPayload.amount as number, 0)
      : DEFAULT_GATHER_AMOUNT;
    const maxDistance = Number.isFinite(typedPayload.maxDistance)
      ? Math.max(typedPayload.maxDistance as number, 0)
      : configuredRange;

    const harvest = resourceField.harvest({
      nodeId,
      origin: typedContext.state.position,
      amount: requestedAmount > 0 ? requestedAmount : DEFAULT_GATHER_AMOUNT,
      maxDistance,
    });

    const gatherSummary = {
      nodeId,
      status: harvest.status,
      harvested: harvest.harvested,
      remaining: harvest.remaining,
      type: harvest.type,
      distance: Math.round(harvest.distance * 100) / 100,
    } as const;
    this.port.updateValue('lastGather', gatherSummary);

    if (!harvest.type || harvest.harvested <= 0) {
      return { ...gatherSummary, stored: 0, overflow: 0 };
    }

    const storeResult = inventory.store(harvest.type, harvest.harvested);
    let remaining = harvest.remaining;
    if (storeResult.overflow > 0) {
      remaining = resourceField.restore(nodeId, storeResult.overflow);
    }

    if (storeResult.stored > 0) {
      this.operationsCompleted += 1;
      this.harvestedTotal += storeResult.stored;
      this.port.updateValue('operationsCompleted', this.operationsCompleted);
      this.port.updateValue('totalHarvested', this.harvestedTotal);
    }

    const status = storeResult.stored <= 0 ? 'no-space' : storeResult.overflow > 0 ? 'partial' : harvest.status;

    const result = {
      status,
      nodeId,
      type: harvest.type,
      harvested: storeResult.stored,
      overflow: storeResult.overflow,
      remaining,
      storedTotal: this.harvestedTotal,
      distance: gatherSummary.distance,
    };
    this.port.updateValue('lastGather', {
      ...gatherSummary,
      status,
      harvested: storeResult.stored,
      remaining,
      overflow: storeResult.overflow,
    });
    return result;
  }
}
