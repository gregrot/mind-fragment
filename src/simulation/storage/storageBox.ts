import type { InventoryEntry } from '../mechanism/inventory';

export interface StorageBoxSnapshot {
  id: string;
  label: string;
  capacity: number;
  used: number;
  available: number;
  contents: InventoryEntry[];
}

export interface StorageStoreResult {
  stored: number;
  overflow: number;
  total: number;
}

export interface StorageWithdrawResult {
  withdrawn: number;
  remaining: number;
  total: number;
}

export interface StorageBoxOptions {
  id: string;
  label?: string;
  capacity?: number;
}

const normaliseResourceId = (resource: string | null | undefined): string | null => {
  const trimmed = resource?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export class StorageBox {
  readonly id: string;
  readonly label: string;
  private capacity: number;
  private readonly contents = new Map<string, number>();

  constructor({ id, label, capacity = 120 }: StorageBoxOptions) {
    if (!id?.trim()) {
      throw new Error('Storage boxes require an identifier.');
    }
    this.id = id.trim();
    this.label = label?.trim() || this.id;
    this.capacity = Math.max(capacity, 0);
  }

  configureCapacity(capacity: number): void {
    if (!Number.isFinite(capacity) || capacity < 0) {
      return;
    }
    this.capacity = Math.max(capacity, 0);
  }

  getCapacity(): number {
    return this.capacity;
  }

  getUsed(): number {
    let used = 0;
    for (const quantity of this.contents.values()) {
      used += Math.max(quantity, 0);
    }
    return used;
  }

  getAvailable(): number {
    return Math.max(this.capacity - this.getUsed(), 0);
  }

  getQuantity(resource: string): number {
    const id = normaliseResourceId(resource);
    if (!id) {
      return 0;
    }
    return Math.max(this.contents.get(id) ?? 0, 0);
  }

  store(resource: string, amount: number): StorageStoreResult {
    const id = normaliseResourceId(resource);
    const safeAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
    if (!id || safeAmount <= 0) {
      return { stored: 0, overflow: 0, total: this.getQuantity(id ?? '') };
    }

    const available = this.getAvailable();
    const stored = Math.min(safeAmount, available);
    const overflow = safeAmount - stored;
    if (stored > 0) {
      const current = this.contents.get(id) ?? 0;
      this.contents.set(id, clamp(current + stored, 0, Number.POSITIVE_INFINITY));
    }

    return {
      stored,
      overflow,
      total: this.getQuantity(id),
    } satisfies StorageStoreResult;
  }

  withdraw(resource: string, amount: number): StorageWithdrawResult {
    const id = normaliseResourceId(resource);
    const safeAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
    if (!id || safeAmount <= 0) {
      return { withdrawn: 0, remaining: this.getQuantity(id ?? ''), total: this.getQuantity(id ?? '') };
    }

    const current = this.contents.get(id) ?? 0;
    const withdrawn = Math.min(current, safeAmount);
    if (withdrawn > 0) {
      const next = clamp(current - withdrawn, 0, Number.POSITIVE_INFINITY);
      if (next <= 0) {
        this.contents.delete(id);
      } else {
        this.contents.set(id, next);
      }
    }

    const remaining = this.getQuantity(id);
    return { withdrawn, remaining, total: remaining } satisfies StorageWithdrawResult;
  }

  clear(): void {
    this.contents.clear();
  }

  getSnapshot(): StorageBoxSnapshot {
    const entries: InventoryEntry[] = [];
    for (const [resource, quantity] of this.contents.entries()) {
      if (quantity > 0) {
        entries.push({ resource, quantity });
      }
    }
    entries.sort((a, b) => a.resource.localeCompare(b.resource));

    return {
      id: this.id,
      label: this.label,
      capacity: this.capacity,
      used: this.getUsed(),
      available: this.getAvailable(),
      contents: entries,
    } satisfies StorageBoxSnapshot;
  }
}

export interface StorageRegistrySnapshot {
  boxes: StorageBoxSnapshot[];
}

export interface ConfigureStorageBoxOptions {
  capacity?: number;
}

export class StorageRegistry {
  private readonly boxes = new Map<string, StorageBox>();

  constructor(initialBoxes: StorageBoxOptions[] = []) {
    for (const box of initialBoxes) {
      this.addBox(box);
    }
  }

  addBox(options: StorageBoxOptions): StorageBox {
    const existing = this.boxes.get(options.id);
    if (existing) {
      return existing;
    }
    const box = new StorageBox(options);
    this.boxes.set(box.id, box);
    return box;
  }

  getBox(id: string): StorageBox | null {
    const trimmed = id?.trim();
    if (!trimmed) {
      return null;
    }
    return this.boxes.get(trimmed) ?? null;
  }

  getBoxSnapshot(id: string): StorageBoxSnapshot | null {
    const box = this.getBox(id);
    return box ? box.getSnapshot() : null;
  }

  configureBox(id: string, options: ConfigureStorageBoxOptions): void {
    const box = this.getBox(id);
    if (!box) {
      return;
    }
    if (Number.isFinite(options.capacity)) {
      box.configureCapacity(Math.max(options.capacity as number, 0));
    }
  }

  store(boxId: string, resource: string, amount: number): StorageStoreResult {
    const box = this.getBox(boxId);
    if (!box) {
      return { stored: 0, overflow: 0, total: 0 };
    }
    return box.store(resource, amount);
  }

  withdraw(boxId: string, resource: string, amount: number): StorageWithdrawResult {
    const box = this.getBox(boxId);
    if (!box) {
      return { withdrawn: 0, remaining: 0, total: 0 };
    }
    return box.withdraw(resource, amount);
  }

  clear(boxId: string): void {
    const box = this.getBox(boxId);
    box?.clear();
  }

  getSnapshot(): StorageRegistrySnapshot {
    const boxes = [...this.boxes.values()].map((box) => box.getSnapshot());
    boxes.sort((a, b) => a.id.localeCompare(b.id));
    return { boxes } satisfies StorageRegistrySnapshot;
  }
}

export const DEFAULT_STORAGE_BOX_ID = 'storage.box.base';

export const createDefaultStorageRegistry = (): StorageRegistry => {
  return new StorageRegistry([
    { id: DEFAULT_STORAGE_BOX_ID, label: 'Base Storage', capacity: 240 },
  ]);
};

