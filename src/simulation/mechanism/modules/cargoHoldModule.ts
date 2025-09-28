import { MechanismModule } from '../MechanismModule';
import type { ModulePort } from '../moduleBus';
import type { ModuleRuntimeContext } from '../MechanismChassis';
import type { InventoryStore, InventorySnapshot } from '../inventory';

interface CapacityPayload {
  capacity?: number;
}

interface StorePayload {
  resource?: string;
  amount?: number;
}

interface WithdrawPayload {
  resource?: string;
  amount?: number;
}

interface ClearPayload {
  confirm?: boolean;
}

const clampCapacity = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(value as number, 0);
};

const normaliseResourceId = (resource?: string): string | null => {
  const trimmed = resource?.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

const formatSnapshot = (snapshot: InventorySnapshot) => ({
  capacity: snapshot.capacity,
  used: snapshot.used,
  available: snapshot.available,
  contents: snapshot.entries,
});

export interface CargoHoldModuleOptions {
  capacity?: number;
}

export class CargoHoldModule extends MechanismModule {
  private readonly defaultCapacity: number;
  private port: ModulePort | null = null;
  private inventory: InventoryStore | null = null;
  private unsubscribe: (() => void) | null = null;
  private lastTransaction: Record<string, unknown> | null = null;

  constructor({ capacity = 120 }: CargoHoldModuleOptions = {}) {
    super({
      id: 'storage.cargo',
      title: 'Modular Cargo Hold',
      provides: ['inventory.storage'],
      requires: [],
      attachment: { slot: 'core', index: 1 },
      capacityCost: 1,
    });
    this.defaultCapacity = Math.max(capacity, 0);
  }

  override onAttach(port: ModulePort, _state: unknown, context: unknown): void {
    this.port = port;
    const runtime = context as ModuleRuntimeContext | undefined;
    this.inventory = runtime?.inventory ?? null;
    this.lastTransaction = null;

    port.publishValue('capacity', this.defaultCapacity, {
      label: 'Cargo capacity',
      unit: 'units',
    });
    port.publishValue('used', 0, {
      label: 'Utilised capacity',
      unit: 'units',
    });
    port.publishValue('available', this.defaultCapacity, {
      label: 'Available capacity',
      unit: 'units',
    });
    port.publishValue('contents', [], {
      label: 'Stored resources',
    });
    port.publishValue('lastTransaction', null, {
      label: 'Last transaction',
    });

    port.registerAction(
      'configureCapacity',
      (payload) => this.configureCapacity(payload),
      {
        label: 'Configure hold capacity',
        summary: 'Override the cargo hold capacity contribution.',
        parameters: [{ key: 'capacity', label: 'Target capacity', unit: 'units' }],
      },
    );

    port.registerAction(
      'storeResource',
      (payload, actionContext) => this.storeResource(payload, actionContext),
      {
        label: 'Store resource',
        summary: 'Deposit a resource stack into the shared cargo hold.',
        parameters: [
          { key: 'resource', label: 'Resource id' },
          { key: 'amount', label: 'Amount', unit: 'units' },
        ],
      },
    );

    port.registerAction(
      'withdrawResource',
      (payload, actionContext) => this.withdrawResource(payload, actionContext),
      {
        label: 'Withdraw resource',
        summary: 'Remove a resource stack from the cargo hold.',
        parameters: [
          { key: 'resource', label: 'Resource id' },
          { key: 'amount', label: 'Amount', unit: 'units' },
        ],
      },
    );

    port.registerAction(
      'clearInventory',
      (payload) => this.clearInventory(payload),
      {
        label: 'Clear inventory',
        summary: 'Dump the cargo hold contents when confirmation is provided.',
        parameters: [{ key: 'confirm', label: 'Confirm clear (true/false)' }],
      },
    );

    if (this.inventory) {
      this.inventory.setCapacitySource(this.definition.id, this.defaultCapacity);
      this.unsubscribe = this.inventory.subscribe((snapshot) => this.syncTelemetry(snapshot));
    } else {
      this.syncTelemetry({
        capacity: this.defaultCapacity,
        used: 0,
        available: this.defaultCapacity,
        entries: [],
        slots: [],
        slotCapacity: 0,
        equipment: [],
      });
    }
  }

  override onDetach(): void {
    this.port?.unregisterAction('configureCapacity');
    this.port?.unregisterAction('storeResource');
    this.port?.unregisterAction('withdrawResource');
    this.port?.unregisterAction('clearInventory');
    this.unsubscribe?.();
    if (this.inventory) {
      this.inventory.removeCapacitySource(this.definition.id);
    }
    this.unsubscribe = null;
    this.inventory = null;
    this.port = null;
    this.lastTransaction = null;
  }

  private configureCapacity(payload: unknown): number {
    if (!this.inventory || !this.port) {
      return this.defaultCapacity;
    }
    const typed = (payload ?? {}) as CapacityPayload;
    const capacity = clampCapacity(typed.capacity, this.defaultCapacity);
    this.inventory.setCapacitySource(this.definition.id, capacity);
    return capacity;
  }

  private storeResource(payload: unknown, _context: unknown): Record<string, unknown> {
    if (!this.inventory || !this.port) {
      return { status: 'inactive', stored: 0 };
    }
    const typedPayload = (payload ?? {}) as StorePayload;
    const resourceId = normaliseResourceId(typedPayload.resource);
    const amount = Number.isFinite(typedPayload.amount) ? Math.max(typedPayload.amount as number, 0) : 0;
    if (!resourceId || amount <= 0) {
      return { status: 'invalid', stored: 0 };
    }

    const result = this.inventory.store(resourceId, amount);
    this.lastTransaction = {
      type: 'store',
      resource: resourceId,
      stored: result.stored,
      overflow: result.overflow,
      total: result.total,
    };
    this.port.updateValue('lastTransaction', this.lastTransaction);

    const status = result.stored <= 0 ? 'no-space' : result.overflow > 0 ? 'partial' : 'stored';
    return {
      status,
      resource: resourceId,
      stored: result.stored,
      overflow: result.overflow,
      total: result.total,
    };
  }

  private withdrawResource(payload: unknown, _context: unknown): Record<string, unknown> {
    if (!this.inventory || !this.port) {
      return { status: 'inactive', withdrawn: 0 };
    }
    const typedPayload = (payload ?? {}) as WithdrawPayload;
    const resourceId = normaliseResourceId(typedPayload.resource);
    const amount = Number.isFinite(typedPayload.amount) ? Math.max(typedPayload.amount as number, 0) : 0;
    if (!resourceId || amount <= 0) {
      return { status: 'invalid', withdrawn: 0 };
    }

    const result = this.inventory.withdraw(resourceId, amount);
    this.lastTransaction = {
      type: 'withdraw',
      resource: resourceId,
      withdrawn: result.withdrawn,
      remaining: result.remaining,
      total: result.total,
    };
    this.port.updateValue('lastTransaction', this.lastTransaction);

    const status = result.withdrawn <= 0 ? 'empty' : result.remaining > 0 ? 'partial' : 'emptied';
    return {
      status,
      resource: resourceId,
      withdrawn: result.withdrawn,
      remaining: result.remaining,
      total: result.total,
    };
  }

  private clearInventory(payload: unknown): Record<string, unknown> {
    if (!this.inventory || !this.port) {
      return { status: 'inactive' };
    }
    const typedPayload = (payload ?? {}) as ClearPayload;
    if (!typedPayload.confirm) {
      return { status: 'cancelled' };
    }
    this.inventory.clear();
    this.lastTransaction = { type: 'clear', timestamp: Date.now() };
    this.port.updateValue('lastTransaction', this.lastTransaction);
    return { status: 'cleared' };
  }

  private syncTelemetry(snapshot: InventorySnapshot): void {
    if (!this.port) {
      return;
    }
    const formatted = formatSnapshot(snapshot);
    this.port.updateValue('capacity', formatted.capacity);
    this.port.updateValue('used', formatted.used);
    this.port.updateValue('available', formatted.available);
    this.port.updateValue('contents', formatted.contents);
    if (!this.lastTransaction) {
      this.port.updateValue('lastTransaction', null);
    }
  }
}
