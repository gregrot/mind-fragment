export interface InventoryEntry {
  resource: string;
  quantity: number;
}

export interface InventorySnapshot {
  capacity: number;
  used: number;
  available: number;
  entries: InventoryEntry[];
}

export interface StoreResult {
  stored: number;
  overflow: number;
  total: number;
}

export interface WithdrawResult {
  withdrawn: number;
  remaining: number;
  total: number;
}

type InventoryListener = (snapshot: InventorySnapshot) => void;

export class InventoryStore {
  private readonly contents = new Map<string, number>();
  private readonly capacitySources = new Map<string, number>();
  private readonly listeners = new Set<InventoryListener>();

  setCapacitySource(id: string, capacity: number): void {
    const safeCapacity = Math.max(capacity, 0);
    if (safeCapacity === 0) {
      this.capacitySources.delete(id);
    } else {
      this.capacitySources.set(id, safeCapacity);
    }
    this.notifyChange();
  }

  removeCapacitySource(id: string): void {
    if (this.capacitySources.delete(id)) {
      this.notifyChange();
    }
  }

  getCapacity(): number {
    let total = 0;
    for (const value of this.capacitySources.values()) {
      total += value;
    }
    return total;
  }

  getUsed(): number {
    let used = 0;
    for (const value of this.contents.values()) {
      used += Math.max(value, 0);
    }
    return used;
  }

  getAvailable(): number {
    return Math.max(this.getCapacity() - this.getUsed(), 0);
  }

  getQuantity(resource: string): number {
    return this.contents.get(resource) ?? 0;
  }

  store(resource: string, amount: number): StoreResult {
    const normalisedResource = resource.trim().toLowerCase();
    if (!normalisedResource || !Number.isFinite(amount) || amount <= 0) {
      return { stored: 0, overflow: 0, total: this.getQuantity(normalisedResource) };
    }

    const available = this.getAvailable();
    if (available <= 0) {
      return { stored: 0, overflow: amount, total: this.getQuantity(normalisedResource) };
    }

    const accepted = Math.min(amount, available);
    const overflow = Math.max(amount - accepted, 0);
    const next = this.getQuantity(normalisedResource) + accepted;
    this.contents.set(normalisedResource, next);
    this.notifyChange();
    return { stored: accepted, overflow, total: next };
  }

  withdraw(resource: string, amount: number): WithdrawResult {
    const normalisedResource = resource.trim().toLowerCase();
    if (!normalisedResource || !Number.isFinite(amount) || amount <= 0) {
      return { withdrawn: 0, remaining: this.getQuantity(normalisedResource), total: this.getQuantity(normalisedResource) };
    }

    const current = this.getQuantity(normalisedResource);
    if (current <= 0) {
      return { withdrawn: 0, remaining: 0, total: 0 };
    }

    const withdrawn = Math.min(amount, current);
    const remaining = current - withdrawn;
    if (remaining <= 0) {
      this.contents.delete(normalisedResource);
    } else {
      this.contents.set(normalisedResource, remaining);
    }
    this.notifyChange();
    return { withdrawn, remaining: Math.max(remaining, 0), total: Math.max(remaining, 0) };
  }

  clear(): void {
    if (this.contents.size === 0) {
      return;
    }
    this.contents.clear();
    this.notifyChange();
  }

  reset(): void {
    this.contents.clear();
    this.capacitySources.clear();
    this.notifyChange();
  }

  getSnapshot(): InventorySnapshot {
    const entries: InventoryEntry[] = [];
    for (const [resource, quantity] of this.contents.entries()) {
      entries.push({ resource, quantity });
    }
    entries.sort((a, b) => a.resource.localeCompare(b.resource));
    const used = this.getUsed();
    const capacity = this.getCapacity();
    return {
      capacity,
      used,
      available: Math.max(capacity - used, 0),
      entries,
    };
  }

  subscribe(listener: InventoryListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyChange(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
