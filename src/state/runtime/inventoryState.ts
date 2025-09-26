import type { InventoryEntry, InventorySnapshot } from '../../simulation/mechanism/inventory';
import type { SlotSchema } from '../../types/slots';

export type InventoryListener = (snapshot: InventorySnapshot) => void;

export interface InventoryOverlayUpdate {
  capacity: number;
  slots: SlotSchema[];
}

export interface InventoryActivationHandlers {
  onActive?: () => void;
  onInactive?: () => void;
}

const EMPTY_INVENTORY_SNAPSHOT_INTERNAL: InventorySnapshot = {
  capacity: 0,
  used: 0,
  available: 0,
  entries: [],
  slots: [],
  slotCapacity: 0,
};

export const EMPTY_INVENTORY_SNAPSHOT: InventorySnapshot = EMPTY_INVENTORY_SNAPSHOT_INTERNAL;

const normaliseSlot = (slot: SlotSchema): SlotSchema => ({
  ...slot,
  metadata: { ...slot.metadata },
});

const resolveStackCount = (slot: SlotSchema): number => {
  if (!slot.occupantId) {
    return 0;
  }
  const stackCount = Number.isFinite(slot.stackCount) ? Math.floor(slot.stackCount ?? 0) : 0;
  if (stackCount <= 0) {
    return 1;
  }
  return stackCount;
};

const buildInventoryEntries = (slots: SlotSchema[]): InventoryEntry[] => {
  const totals = new Map<string, number>();
  for (const slot of slots) {
    if (!slot.occupantId) {
      continue;
    }
    const quantity = resolveStackCount(slot);
    if (quantity <= 0) {
      continue;
    }
    const current = totals.get(slot.occupantId) ?? 0;
    totals.set(slot.occupantId, current + quantity);
  }
  return Array.from(totals.entries()).map(([resource, quantity]) => ({ resource, quantity }));
};

export class InventoryState {
  private snapshot: InventorySnapshot = EMPTY_INVENTORY_SNAPSHOT_INTERNAL;
  private readonly listeners = new Set<InventoryListener>();
  private onActive: (() => void) | undefined;
  private onInactive: (() => void) | undefined;

  setActivationHandlers(handlers: InventoryActivationHandlers): void {
    this.onActive = handlers.onActive;
    this.onInactive = handlers.onInactive;
    if (this.listeners.size > 0) {
      this.onActive?.();
    }
  }

  subscribe(listener: InventoryListener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.onActive?.();
    }
    listener(this.snapshot);
    return () => {
      if (!this.listeners.delete(listener)) {
        return;
      }
      if (this.listeners.size === 0) {
        this.onInactive?.();
      }
    };
  }

  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  getSnapshot(): InventorySnapshot {
    return this.snapshot;
  }

  setSnapshot(snapshot: InventorySnapshot): void {
    this.snapshot = snapshot;
    this.notify();
  }

  applyOverlayUpdate(update: InventoryOverlayUpdate): void {
    const normalisedSlots = update.slots.map((slot) => normaliseSlot(slot)).sort((a, b) => a.index - b.index);
    const entries = buildInventoryEntries(normalisedSlots);
    const used = entries.reduce((total, entry) => total + Math.max(entry.quantity, 0), 0);
    const capacity = Math.max(update.capacity, used, 0);
    const snapshot: InventorySnapshot = {
      capacity,
      used,
      available: Math.max(capacity - used, 0),
      entries,
      slots: normalisedSlots,
      slotCapacity: Math.max(update.capacity, 0),
    };
    this.setSnapshot(snapshot);
  }

  clear(): void {
    this.setSnapshot(EMPTY_INVENTORY_SNAPSHOT_INTERNAL);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
