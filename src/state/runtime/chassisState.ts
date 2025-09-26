import type { ChassisSnapshot } from '../../simulation/mechanism';
import type { SlotSchema } from '../../types/slots';

export type ChassisListener = (snapshot: ChassisSnapshot) => void;

export interface ChassisOverlayUpdate {
  capacity: number;
  slots: SlotSchema[];
}

export interface ChassisActivationHandlers {
  onActive?: () => void;
  onInactive?: () => void;
}

const EMPTY_CHASSIS_SNAPSHOT_INTERNAL: ChassisSnapshot = {
  capacity: 0,
  slots: [],
};

export const EMPTY_CHASSIS_SNAPSHOT: ChassisSnapshot = EMPTY_CHASSIS_SNAPSHOT_INTERNAL;

const normaliseSlot = (slot: SlotSchema): SlotSchema => ({
  ...slot,
  metadata: { ...slot.metadata },
});

export class ChassisState {
  private snapshot: ChassisSnapshot = EMPTY_CHASSIS_SNAPSHOT_INTERNAL;
  private readonly listeners = new Set<ChassisListener>();
  private onActive: (() => void) | undefined;
  private onInactive: (() => void) | undefined;

  setActivationHandlers(handlers: ChassisActivationHandlers): void {
    this.onActive = handlers.onActive;
    this.onInactive = handlers.onInactive;
    if (this.listeners.size > 0) {
      this.onActive?.();
    }
  }

  subscribe(listener: ChassisListener): () => void {
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

  getSnapshot(): ChassisSnapshot {
    return this.snapshot;
  }

  setSnapshot(snapshot: ChassisSnapshot): void {
    this.snapshot = snapshot;
    this.notify();
  }

  applyOverlayUpdate(update: ChassisOverlayUpdate): void {
    const slots = update.slots.map((slot) => normaliseSlot(slot)).sort((a, b) => a.index - b.index);
    const snapshot: ChassisSnapshot = {
      capacity: Math.max(update.capacity, 0),
      slots,
    };
    this.setSnapshot(snapshot);
  }

  clear(): void {
    this.setSnapshot(EMPTY_CHASSIS_SNAPSHOT_INTERNAL);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
