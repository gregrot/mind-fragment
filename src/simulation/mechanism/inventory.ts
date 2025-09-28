import type { SlotMetadata, SlotSchema } from '../../types/slots';

export interface InventoryEntry {
  resource: string;
  quantity: number;
}

export interface EquipmentEntry {
  slotId: string;
  index: number;
  itemId: string;
  metadata: SlotMetadata;
}

export interface InventorySnapshot {
  capacity: number;
  used: number;
  available: number;
  entries: InventoryEntry[];
  slots: SlotSchema[];
  slotCapacity: number;
  equipment: EquipmentEntry[];
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

export type SlotTransferStatus =
  | 'noop'
  | 'invalid-source'
  | 'invalid-target'
  | 'invalid-amount'
  | 'empty-source'
  | 'slot-locked'
  | 'rejected'
  | 'moved'
  | 'split'
  | 'merged'
  | 'swapped';

export interface SlotTransferResult {
  status: SlotTransferStatus;
  moved: number;
  remainder: number;
  source: SlotSchema;
  target: SlotSchema;
}

interface SlotDefinition {
  id: string;
  index: number;
  metadata: SlotMetadata;
}

interface SlotState {
  occupantId: string | null;
  stackCount: number;
}

interface SlotSnapshot {
  capacity: number;
  slots: SlotSchema[];
}

type InventoryListener = (snapshot: InventorySnapshot) => void;
type SlotListener = (snapshot: SlotSnapshot) => void;

const DEFAULT_SLOT_CAPACITY = 10;
const SLOT_ID_PREFIX = 'inventory';

const createSlotId = (index: number): string => `${SLOT_ID_PREFIX}-${index}`;

const normaliseResourceId = (resource: string | null | undefined): string | null => {
  const trimmed = resource?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

export class InventoryStore {
  private readonly capacitySources = new Map<string, number>();
  private readonly listeners = new Set<InventoryListener>();
  private readonly slotListeners = new Set<SlotListener>();
  private readonly slotDefinitions = new Map<string, SlotDefinition>();
  private readonly slotStates = new Map<string, SlotState>();
  private slotCapacity = 0;

  constructor(slotCapacity: number = DEFAULT_SLOT_CAPACITY) {
    this.configureSlotCapacity(slotCapacity);
  }

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

  configureSlotCapacity(capacity: number): void {
    const safeCapacity = Number.isFinite(capacity) ? Math.max(Math.floor(capacity), 0) : 0;
    if (safeCapacity <= this.slotCapacity) {
      // Prevent shrinking below existing populated slots to avoid data loss.
      if (safeCapacity < this.slotCapacity) {
        for (let index = safeCapacity; index < this.slotCapacity; index += 1) {
          const slotId = createSlotId(index);
          const state = this.slotStates.get(slotId);
          if (state?.occupantId) {
            return;
          }
        }
        for (let index = safeCapacity; index < this.slotCapacity; index += 1) {
          const slotId = createSlotId(index);
          this.slotDefinitions.delete(slotId);
          this.slotStates.delete(slotId);
        }
        this.slotCapacity = safeCapacity;
        this.notifyChange();
      }
      return;
    }

    for (let index = this.slotCapacity; index < safeCapacity; index += 1) {
      const slotId = createSlotId(index);
      this.slotDefinitions.set(slotId, {
        id: slotId,
        index,
        metadata: this.createSlotMetadata(),
      });
      this.slotStates.set(slotId, { occupantId: null, stackCount: 0 });
    }
    this.slotCapacity = safeCapacity;
    this.notifyChange();
  }

  getSlotCapacity(): number {
    return this.slotCapacity;
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
    for (const state of this.slotStates.values()) {
      if (state.occupantId) {
        used += Math.max(state.stackCount, 0);
      }
    }
    return used;
  }

  getAvailable(): number {
    return Math.max(this.getCapacity() - this.getUsed(), 0);
  }

  getQuantity(resource: string): number {
    const normalised = normaliseResourceId(resource);
    if (!normalised) {
      return 0;
    }
    let total = 0;
    for (const definition of this.getOrderedSlotDefinitions()) {
      if (!definition.metadata.stackable) {
        continue;
      }
      const state = this.getSlotState(definition.id);
      if (state.occupantId !== normalised) {
        continue;
      }
      const stackCount = Math.max(state.stackCount, 0);
      total += stackCount > 0 ? stackCount : 1;
    }
    return total;
  }

  setSlotMetadata(slotId: string, overrides: Partial<SlotMetadata>): SlotSchema | null {
    const definition = this.slotDefinitions.get(slotId);
    if (!definition) {
      return null;
    }
    const nextDefinition: SlotDefinition = {
      ...definition,
      metadata: this.createSlotMetadata({ ...definition.metadata, ...overrides }),
    };
    this.slotDefinitions.set(slotId, nextDefinition);
    const snapshot = this.buildSlotSchema(nextDefinition);
    this.notifyChange();
    return snapshot;
  }

  getSlot(slotId: string): SlotSchema | null {
    const definition = this.slotDefinitions.get(slotId);
    if (!definition) {
      return null;
    }
    return this.buildSlotSchema(definition);
  }

  getSlotSchemaByIndex(index: number): SlotSchema | null {
    const definition = this.getSlotDefinitionByIndex(index);
    if (!definition) {
      return null;
    }
    return this.buildSlotSchema(definition);
  }

  getSlotOccupantByIndex(index: number): string | null {
    const definition = this.getSlotDefinitionByIndex(index);
    if (!definition) {
      return null;
    }
    const state = this.getSlotState(definition.id);
    return state.occupantId;
  }

  setSlotConfiguration(
    index: number,
    { occupantId, stackCount, metadata }: { occupantId?: string | null; stackCount?: number; metadata?: Partial<SlotMetadata> } = {},
  ): SlotSchema | null {
    const definition = this.getSlotDefinitionByIndex(index);
    if (!definition) {
      return null;
    }

    let updatedDefinition = definition;
    let metadataChanged = false;
    if (metadata) {
      const nextMetadata = this.createSlotMetadata({ ...definition.metadata, ...metadata });
      updatedDefinition = { ...definition, metadata: nextMetadata } satisfies SlotDefinition;
      this.slotDefinitions.set(definition.id, updatedDefinition);
      metadataChanged = true;
    }

    const state = this.getSlotState(updatedDefinition.id);
    const normalisedOccupant = normaliseResourceId(occupantId);
    let contentsChanged = false;

    if (!normalisedOccupant) {
      if (state.occupantId !== null || state.stackCount !== 0) {
        state.occupantId = null;
        state.stackCount = 0;
        contentsChanged = true;
      }
    } else {
      const resolvedStackCount = this.resolveStackCount(updatedDefinition, stackCount);
      if (state.occupantId !== normalisedOccupant || state.stackCount !== resolvedStackCount) {
        state.occupantId = normalisedOccupant;
        state.stackCount = resolvedStackCount;
        contentsChanged = true;
      }
    }

    if (metadataChanged || contentsChanged) {
      this.notifyChange();
    }

    return this.buildSlotSchema(updatedDefinition);
  }

  getSlotSchemaSnapshot(): SlotSnapshot {
    return {
      capacity: this.slotCapacity,
      slots: this.getOrderedSlotDefinitions().map((definition) => this.buildSlotSchema(definition)),
    } satisfies SlotSnapshot;
  }

  transferSlotItem(sourceId: string, targetId: string, amount?: number): SlotTransferResult {
    if (sourceId === targetId) {
      const definition = this.slotDefinitions.get(sourceId);
      const snapshot = definition ? this.buildSlotSchema(definition) : null;
      if (!snapshot) {
        return {
          status: 'invalid-source',
          moved: 0,
          remainder: 0,
          source: { id: sourceId, index: 0, occupantId: null, metadata: { stackable: true, locked: false } },
          target: { id: targetId, index: 0, occupantId: null, metadata: { stackable: true, locked: false } },
        } satisfies SlotTransferResult;
      }
      return {
        status: 'noop',
        moved: 0,
        remainder: snapshot.stackCount ?? 0,
        source: snapshot,
        target: snapshot,
      } satisfies SlotTransferResult;
    }

    const sourceDefinition = this.slotDefinitions.get(sourceId);
    if (!sourceDefinition) {
      return this.createInvalidTransferResult(sourceId, targetId, 'invalid-source');
    }
    const targetDefinition = this.slotDefinitions.get(targetId);
    if (!targetDefinition) {
      return this.createInvalidTransferResult(sourceId, targetId, 'invalid-target');
    }

    const sourceState = this.getSlotState(sourceId);
    const targetState = this.getSlotState(targetId);

    if (!sourceState.occupantId || sourceState.stackCount <= 0) {
      return this.createTransferResult(
        'empty-source',
        0,
        sourceDefinition,
        targetDefinition,
      );
    }

    if (targetDefinition.metadata.locked) {
      return this.createTransferResult('slot-locked', 0, sourceDefinition, targetDefinition);
    }

    const maxMove = Math.max(sourceState.stackCount, 0);
    const requested = amount === undefined ? maxMove : Math.min(Math.max(amount, 0), maxMove);

    if (requested <= 0) {
      return this.createTransferResult('invalid-amount', 0, sourceDefinition, targetDefinition);
    }

    let status: SlotTransferStatus = 'rejected';
    let moved = 0;

    if (!targetState.occupantId) {
      moved = requested;
      sourceState.stackCount -= moved;
      targetState.occupantId = sourceState.occupantId;
      targetState.stackCount = moved;
      if (sourceState.stackCount <= 0) {
        sourceState.occupantId = null;
        sourceState.stackCount = 0;
        status = 'moved';
      } else {
        status = 'split';
      }
    } else {
      const sameOccupant = targetState.occupantId === sourceState.occupantId;
      const canMerge =
        sameOccupant && sourceDefinition.metadata.stackable && targetDefinition.metadata.stackable;

      if (canMerge) {
        moved = requested;
        sourceState.stackCount -= moved;
        targetState.stackCount += moved;
        if (sourceState.stackCount <= 0) {
          sourceState.occupantId = null;
          sourceState.stackCount = 0;
        }
        status = 'merged';
      } else if (requested === maxMove) {
        const targetOccupantId = targetState.occupantId;
        const targetCount = targetState.stackCount;
        targetState.occupantId = sourceState.occupantId;
        targetState.stackCount = sourceState.stackCount;
        sourceState.occupantId = targetOccupantId;
        sourceState.stackCount = targetCount;
        moved = maxMove;
        status = 'swapped';
      } else {
        return this.createTransferResult('rejected', 0, sourceDefinition, targetDefinition);
      }
    }

    const result = this.createTransferResult(status, moved, sourceDefinition, targetDefinition);
    this.notifyChange();
    return result;
  }

  store(resource: string, amount: number): StoreResult {
    const normalisedResource = normaliseResourceId(resource);
    if (!normalisedResource || !Number.isFinite(amount) || amount <= 0) {
      const total = normalisedResource ? this.getQuantity(normalisedResource) : 0;
      return { stored: 0, overflow: 0, total } satisfies StoreResult;
    }

    const available = this.getAvailable();
    if (available <= 0) {
      return { stored: 0, overflow: amount, total: this.getQuantity(normalisedResource) } satisfies StoreResult;
    }

    let remaining = Math.min(amount, available);
    let stored = 0;

    const definitions = this.getOrderedSlotDefinitions();

    for (const definition of definitions) {
      if (remaining <= 0) {
        break;
      }
      const state = this.getSlotState(definition.id);
      if (!definition.metadata.stackable) {
        continue;
      }
      if (state.occupantId === normalisedResource) {
        state.stackCount += remaining;
        stored += remaining;
        remaining = 0;
        break;
      }
    }

    for (const definition of definitions) {
      if (remaining <= 0) {
        break;
      }
      const state = this.getSlotState(definition.id);
      if (state.occupantId || !definition.metadata.stackable) {
        continue;
      }
      state.occupantId = normalisedResource;
      state.stackCount = remaining;
      stored += remaining;
      remaining = 0;
    }

    if (stored > 0) {
      this.notifyChange();
    }

    const total = this.getQuantity(normalisedResource);
    const overflow = amount - stored;
    return {
      stored,
      overflow: Math.max(overflow, 0),
      total,
    } satisfies StoreResult;
  }

  withdraw(resource: string, amount: number): WithdrawResult {
    const normalisedResource = normaliseResourceId(resource);
    if (!normalisedResource || !Number.isFinite(amount) || amount <= 0) {
      const total = normalisedResource ? this.getQuantity(normalisedResource) : 0;
      return { withdrawn: 0, remaining: total, total } satisfies WithdrawResult;
    }

    const totalAvailable = this.getQuantity(normalisedResource);
    if (totalAvailable <= 0) {
      return { withdrawn: 0, remaining: 0, total: 0 } satisfies WithdrawResult;
    }

    let remaining = Math.min(amount, totalAvailable);
    let withdrawn = 0;

    for (const definition of this.getOrderedSlotDefinitions()) {
      if (remaining <= 0) {
        break;
      }
      const state = this.getSlotState(definition.id);
      if (!definition.metadata.stackable || state.occupantId !== normalisedResource) {
        continue;
      }
      const removed = Math.min(state.stackCount, remaining);
      if (removed <= 0) {
        continue;
      }
      state.stackCount -= removed;
      withdrawn += removed;
      remaining -= removed;
      if (state.stackCount <= 0) {
        state.occupantId = null;
        state.stackCount = 0;
      }
    }

    if (withdrawn > 0) {
      this.notifyChange();
    }

    const total = this.getQuantity(normalisedResource);
    return {
      withdrawn,
      remaining: total,
      total,
    } satisfies WithdrawResult;
  }

  clear(): void {
    if (!this.clearContents()) {
      return;
    }
    this.notifyChange();
  }

  reset(): void {
    const hadContents = this.clearContents();
    const hadCapacity = this.capacitySources.size > 0;
    this.capacitySources.clear();
    if (hadContents || hadCapacity) {
      this.notifyChange();
    }
  }

  getSnapshot(): InventorySnapshot {
    const { slots } = this.getSlotSchemaSnapshot();
    const entries = this.buildEntries(slots);
    const equipment = this.buildEquipmentEntries(slots);
    const used = slots.reduce((total, slot) => {
      if (!slot.occupantId) {
        return total;
      }
      const stackCount = Number.isFinite(slot.stackCount) ? Math.max(slot.stackCount ?? 0, 0) : 0;
      return total + (stackCount > 0 ? stackCount : 1);
    }, 0);
    const capacity = this.getCapacity();
    return {
      capacity,
      used,
      available: Math.max(capacity - used, 0),
      entries,
      slots,
      slotCapacity: this.slotCapacity,
      equipment,
    } satisfies InventorySnapshot;
  }

  subscribe(listener: InventoryListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeSlots(listener: SlotListener): () => void {
    this.slotListeners.add(listener);
    listener(this.getSlotSchemaSnapshot());
    return () => {
      this.slotListeners.delete(listener);
    };
  }

  private clearContents(): boolean {
    let changed = false;
    for (const state of this.slotStates.values()) {
      if (state.occupantId !== null || state.stackCount !== 0) {
        state.occupantId = null;
        state.stackCount = 0;
        changed = true;
      }
    }
    return changed;
  }

  private createSlotMetadata(overrides?: Partial<SlotMetadata>): SlotMetadata {
    return {
      stackable: overrides?.stackable ?? true,
      locked: overrides?.locked ?? false,
      moduleSubtype: overrides?.moduleSubtype,
    } satisfies SlotMetadata;
  }

  private resolveStackCount(definition: SlotDefinition, requested?: number): number {
    if (!definition.metadata.stackable) {
      return 1;
    }
    if (!Number.isFinite(requested)) {
      return 1;
    }
    const safe = Math.max(Math.floor(requested ?? 0), 0);
    return safe > 0 ? safe : 1;
  }

  private getSlotState(slotId: string): SlotState {
    let state = this.slotStates.get(slotId);
    if (!state) {
      state = { occupantId: null, stackCount: 0 } satisfies SlotState;
      this.slotStates.set(slotId, state);
    }
    return state;
  }

  private getSlotDefinitionByIndex(index: number): SlotDefinition | null {
    if (!Number.isFinite(index)) {
      return null;
    }
    const safeIndex = Math.max(Math.floor(index), 0);
    return this.slotDefinitions.get(createSlotId(safeIndex)) ?? null;
  }

  private getOrderedSlotDefinitions(): SlotDefinition[] {
    return [...this.slotDefinitions.values()].sort((a, b) => a.index - b.index);
  }

  private buildSlotSchema(definition: SlotDefinition): SlotSchema {
    const state = this.getSlotState(definition.id);
    return {
      id: definition.id,
      index: definition.index,
      occupantId: state.occupantId,
      stackCount: state.stackCount > 1 ? state.stackCount : undefined,
      metadata: { ...definition.metadata },
    } satisfies SlotSchema;
  }

  private buildEntries(slots: SlotSchema[]): InventoryEntry[] {
    const totals = new Map<string, number>();
    for (const slot of slots) {
      if (!slot.occupantId || !slot.metadata.stackable) {
        continue;
      }
      const amount = Math.max(slot.stackCount ?? 1, 0) || 1;
      totals.set(slot.occupantId, (totals.get(slot.occupantId) ?? 0) + amount);
    }
    const entries: InventoryEntry[] = [];
    for (const [resource, quantity] of totals.entries()) {
      entries.push({ resource, quantity });
    }
    entries.sort((a, b) => a.resource.localeCompare(b.resource));
    return entries;
  }

  private buildEquipmentEntries(slots: SlotSchema[]): EquipmentEntry[] {
    const equipment: EquipmentEntry[] = [];
    for (const slot of slots) {
      if (!slot.occupantId || slot.metadata.stackable) {
        continue;
      }
      equipment.push({
        slotId: slot.id,
        index: slot.index,
        itemId: slot.occupantId,
        metadata: { ...slot.metadata },
      });
    }
    return equipment;
  }

  private notifyChange(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
    if (this.slotListeners.size > 0) {
      const slotSnapshot: SlotSnapshot = { capacity: this.slotCapacity, slots: snapshot.slots };
      for (const listener of this.slotListeners) {
        listener(slotSnapshot);
      }
    }
  }

  private createInvalidTransferResult(
    sourceId: string,
    targetId: string,
    status: SlotTransferStatus,
  ): SlotTransferResult {
    const source = this.slotDefinitions.get(sourceId);
    const target = this.slotDefinitions.get(targetId);
    return {
      status,
      moved: 0,
      remainder: 0,
      source: source ? this.buildSlotSchema(source) : this.createVirtualSlot(sourceId),
      target: target ? this.buildSlotSchema(target) : this.createVirtualSlot(targetId),
    } satisfies SlotTransferResult;
  }

  private createTransferResult(
    status: SlotTransferStatus,
    moved: number,
    sourceDefinition: SlotDefinition,
    targetDefinition: SlotDefinition,
  ): SlotTransferResult {
    return {
      status,
      moved,
      remainder: this.getSlotState(sourceDefinition.id).stackCount,
      source: this.buildSlotSchema(sourceDefinition),
      target: this.buildSlotSchema(targetDefinition),
    } satisfies SlotTransferResult;
  }

  private createVirtualSlot(slotId: string): SlotSchema {
    return {
      id: slotId,
      index: 0,
      occupantId: null,
      metadata: this.createSlotMetadata(),
    } satisfies SlotSchema;
  }
}

