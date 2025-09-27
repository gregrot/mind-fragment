import { MechanismModule } from '../MechanismModule';
import type { ModulePort } from '../moduleBus';
import type { ModuleActionContext } from '../MechanismChassis';

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

interface DropResourcePayload {
  resource?: string;
  amount?: number;
  mergeDistance?: number;
}

interface UseInventoryItemPayload {
  slot?: number;
  nodeId?: string;
  target?: { x?: number; y?: number };
}

export interface ManipulationModuleOptions {
  gripStrength?: number;
}

const DEFAULT_GATHER_RANGE = 220;
const DEFAULT_GATHER_AMOUNT = 12;
const DEFAULT_DROP_MERGE_DISTANCE = 32;

export class ManipulationModule extends MechanismModule {
  private readonly defaultGripStrength: number;
  private port: ModulePort | null = null;
  private operationsCompleted = 0;
  private harvestedTotal = 0;
  private depositedTotal = 0;

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
    this.depositedTotal = 0;

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
    port.publishValue('totalDeposited', 0, {
      label: 'Total deposited',
      unit: 'units',
    });
    port.publishValue('lastGather', null, {
      label: 'Last gather result',
    });
    port.publishValue('lastDrop', null, {
      label: 'Last drop result',
    });
    port.publishValue('lastToolUse', null, {
      label: 'Last tool use',
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

    port.registerAction(
      'dropResource',
      (payload, context) => this.dropResource(payload, context),
      {
        label: 'Drop resource',
        summary: 'Release inventory at the current position to form a resource pile.',
        parameters: [
          { key: 'resource', label: 'Resource id' },
          { key: 'amount', label: 'Amount', unit: 'units' },
          { key: 'mergeDistance', label: 'Merge radius', unit: 'units' },
        ],
      },
    );

    port.registerAction(
      'useInventoryItem',
      (payload, context) => this.useInventoryItem(payload, context),
      {
        label: 'Use inventory item',
        summary: 'Activate a tool stored in a specified inventory slot.',
        parameters: [
          { key: 'slot', label: 'Slot index' },
          { key: 'nodeId', label: 'Target node id' },
          { key: 'target.x', label: 'Target X', unit: 'units' },
          { key: 'target.y', label: 'Target Y', unit: 'units' },
        ],
      },
    );
  }

  override onDetach(): void {
    this.port?.unregisterAction('configureGrip');
    this.port?.unregisterAction('grip');
    this.port?.unregisterAction('release');
    this.port?.unregisterAction('gatherResource');
    this.port?.unregisterAction('dropResource');
    this.port?.unregisterAction('useInventoryItem');
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

  private dropResource(payload: unknown, context: unknown): Record<string, unknown> {
    if (!this.port) {
      return { status: 'inactive', totalDropped: 0, resources: [] };
    }

    const typedContext = context as ModuleActionContext;
    const inventory = typedContext?.utilities?.inventory;
    const resourceField = typedContext?.utilities?.resourceField;
    if (!inventory || !resourceField) {
      const fallback = { status: 'missing-systems', totalDropped: 0, resources: [] as never[] };
      this.port.updateValue('lastDrop', fallback);
      return fallback;
    }

    const typedPayload = (payload ?? {}) as DropResourcePayload;
    const origin = { ...typedContext.state.position };
    const mergeDistance = Number.isFinite(typedPayload.mergeDistance)
      ? Math.max(typedPayload.mergeDistance as number, 0)
      : DEFAULT_DROP_MERGE_DISTANCE;
    const specifiedResource = typedPayload.resource?.trim().toLowerCase() ?? null;
    const requestedAmount = Number.isFinite(typedPayload.amount)
      ? Math.max(typedPayload.amount as number, 0)
      : null;

    type DropDetail = {
      resource: string;
      dropped: number;
      remaining: number;
      nodeId: string;
      nodeQuantity: number;
      position: { x: number; y: number };
    };

    const attemptDrop = (resourceId: string, limit: number | null): DropDetail | null => {
      const trimmed = resourceId.trim().toLowerCase();
      if (!trimmed) {
        return null;
      }

      const available = inventory.getQuantity(trimmed);
      const desired = limit !== null ? Math.min(limit, available) : available;
      if (desired <= 0) {
        return null;
      }

      const withdrawal = inventory.withdraw(trimmed, desired);
      if (withdrawal.withdrawn <= 0) {
        return null;
      }

      const node = resourceField.upsertNode({
        type: trimmed,
        position: origin,
        quantity: withdrawal.withdrawn,
        mergeDistance,
        metadata: { source: 'mechanism-drop', operations: this.operationsCompleted + 1 },
      });

      return {
        resource: trimmed,
        dropped: withdrawal.withdrawn,
        remaining: withdrawal.remaining,
        nodeId: node.id,
        nodeQuantity: node.quantity,
        position: { ...node.position },
      };
    };

    const details: DropDetail[] = [];
    if (specifiedResource) {
      const detail = attemptDrop(specifiedResource, requestedAmount);
      if (detail) {
        details.push(detail);
      }
    } else {
      const snapshot = inventory.getSnapshot();
      for (const entry of snapshot.entries) {
        const detail = attemptDrop(entry.resource, null);
        if (detail) {
          details.push(detail);
        }
      }
    }

    const totalDropped = details.reduce((sum, detail) => sum + detail.dropped, 0);
    const partial = details.some((detail) => detail.remaining > 0);
    const status = totalDropped <= 0 ? 'empty' : partial ? 'partial' : 'dropped';

    if (totalDropped > 0) {
      this.operationsCompleted += 1;
      this.depositedTotal += totalDropped;
      this.port.updateValue('operationsCompleted', this.operationsCompleted);
      this.port.updateValue('totalDeposited', this.depositedTotal);
    }

    const summary = {
      status,
      totalDropped,
      resources: details.map((detail) => ({
        resource: detail.resource,
        dropped: detail.dropped,
        remaining: detail.remaining,
        nodeId: detail.nodeId,
        nodeQuantity: detail.nodeQuantity,
        position: detail.position,
      })),
    };

    this.port.updateValue('lastDrop', summary);
    return summary;
  }

  private useInventoryItem(payload: unknown, context: unknown): Record<string, unknown> {
    if (!this.port) {
      return { status: 'inactive' };
    }

    const typedContext = context as ModuleActionContext;
    const inventory = typedContext?.utilities?.inventory;
    const resourceField = typedContext?.utilities?.resourceField;
    if (!inventory || !resourceField) {
      return { status: 'missing-systems' };
    }

    const typedPayload = (payload ?? {}) as UseInventoryItemPayload;
    const rawSlot = typedPayload.slot;
    const slotIndex = Number.isFinite(rawSlot) ? Math.max(Math.floor(rawSlot as number), 0) : null;
    if (slotIndex === null) {
      return { status: 'invalid-slot' };
    }

    const slot = inventory.getSlotSchemaByIndex(slotIndex);
    if (!slot || !slot.occupantId) {
      return { status: 'empty-slot', slotIndex };
    }

    const itemId = slot.occupantId.trim().toLowerCase();
    if (itemId !== 'axe') {
      return { status: 'invalid-item', slotIndex, item: slot.occupantId };
    }

    const nodeId = typedPayload.nodeId?.trim();
    if (!nodeId) {
      return { status: 'invalid-target', slotIndex, item: itemId };
    }

    const rawTarget = typedPayload.target ?? {};
    const target = {
      x: Number.isFinite(rawTarget.x) ? (rawTarget.x as number) : typedContext.state.position.x,
      y: Number.isFinite(rawTarget.y) ? (rawTarget.y as number) : typedContext.state.position.y,
    } as const;

    const hitResult = resourceField.registerHit({ nodeId, toolType: itemId });

    this.port.updateValue('lastToolUse', {
      slotIndex,
      item: itemId,
      nodeId,
      status: hitResult.status,
      remaining: hitResult.remaining,
      target,
    });

    if (hitResult.status === 'ok' || hitResult.status === 'depleted') {
      this.operationsCompleted += 1;
      this.port.updateValue('operationsCompleted', this.operationsCompleted);
    }

    typedContext.requestActuator(
      'manipulation.tool',
      {
        slotIndex,
        item: itemId,
        nodeId,
        target,
        status: hitResult.status,
      },
      4,
    );

    return {
      status: hitResult.status,
      nodeId,
      remaining: hitResult.remaining,
      slotIndex,
      item: itemId,
      target,
    };
  }
}
