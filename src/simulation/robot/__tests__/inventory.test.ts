import { describe, expect, it } from 'vitest';
import { InventoryStore } from '../inventory';

const findSlotByOccupant = (snapshot: ReturnType<InventoryStore['getSnapshot']>, occupantId: string | null) => {
  return snapshot.slots.find((slot) => slot.occupantId === occupantId) ?? null;
};

describe('InventoryStore slot schema integration', () => {
  it('exposes a default slot schema with empty slots', () => {
    const store = new InventoryStore();
    const snapshot = store.getSnapshot();

    expect(snapshot.slotCapacity).toBeGreaterThanOrEqual(10);
    expect(snapshot.slots).toHaveLength(snapshot.slotCapacity);
    for (let index = 0; index < snapshot.slotCapacity; index += 1) {
      const slot = snapshot.slots[index]!;
      expect(slot.id).toBe(`inventory-${index}`);
      expect(slot.index).toBe(index);
      expect(slot.occupantId).toBeNull();
      expect(slot.metadata.stackable).toBe(true);
      expect(slot.metadata.locked).toBe(false);
    }
  });

  it('stores stackable resources and emits snapshot updates', () => {
    const store = new InventoryStore();
    store.setCapacitySource('test', 100);
    let lastInventorySnapshot = store.getSnapshot();
    let lastSlotSnapshot = store.getSlotSchemaSnapshot();

    store.subscribe((snapshot) => {
      lastInventorySnapshot = snapshot;
    });
    store.subscribeSlots((snapshot) => {
      lastSlotSnapshot = snapshot;
    });

    store.store('resource.scrap', 5);

    expect(lastInventorySnapshot.entries).toEqual([{ resource: 'resource.scrap', quantity: 5 }]);
    const scrapSlot = findSlotByOccupant(lastInventorySnapshot, 'resource.scrap');
    expect(scrapSlot).not.toBeNull();
    expect(scrapSlot?.stackCount).toBe(5);

    store.store('resource.scrap', 3);

    expect(lastInventorySnapshot.entries).toEqual([{ resource: 'resource.scrap', quantity: 8 }]);
    const updatedSlot = findSlotByOccupant(lastInventorySnapshot, 'resource.scrap');
    expect(updatedSlot?.stackCount).toBe(8);

    const slotEntry = lastSlotSnapshot.slots.find((slot) => slot.occupantId === 'resource.scrap');
    expect(slotEntry?.stackCount).toBe(8);
  });

  it('supports splitting, merging, and swapping slot contents', () => {
    const store = new InventoryStore();
    store.setCapacitySource('test', 100);
    store.store('resource.scrap', 6);
    store.store('resource.ore', 4);

    const initialSnapshot = store.getSnapshot();
    const scrapSlot = findSlotByOccupant(initialSnapshot, 'resource.scrap');
    const oreSlot = findSlotByOccupant(initialSnapshot, 'resource.ore');
    const emptySlot = initialSnapshot.slots.find((slot) => slot.occupantId === null && slot.id !== scrapSlot?.id);

    expect(scrapSlot).not.toBeNull();
    expect(oreSlot).not.toBeNull();
    expect(emptySlot).not.toBeNull();

    const splitResult = store.transferSlotItem(scrapSlot!.id, emptySlot!.id, 2);
    expect(splitResult.status).toBe('split');
    expect(splitResult.moved).toBe(2);
    expect(splitResult.remainder).toBe(4);

    let snapshot = store.getSnapshot();
    const splitSource = snapshot.slots.find((slot) => slot.id === scrapSlot!.id);
    const splitTarget = snapshot.slots.find((slot) => slot.id === emptySlot!.id);
    expect(splitSource?.stackCount).toBe(4);
    expect(splitTarget?.occupantId).toBe('resource.scrap');
    expect(splitTarget?.stackCount).toBe(2);

    const mergeResult = store.transferSlotItem(splitTarget!.id, splitSource!.id);
    expect(mergeResult.status).toBe('merged');
    snapshot = store.getSnapshot();
    const mergedSource = snapshot.slots.find((slot) => slot.id === splitSource!.id);
    const mergedTarget = snapshot.slots.find((slot) => slot.id === splitTarget!.id);
    expect(mergedSource?.stackCount).toBe(6);
    expect(mergedTarget?.occupantId).toBeNull();

    const swapResult = store.transferSlotItem(mergedSource!.id, oreSlot!.id);
    expect(swapResult.status).toBe('swapped');

    snapshot = store.getSnapshot();
    const swappedSource = snapshot.slots.find((slot) => slot.id === mergedSource!.id);
    const swappedTarget = snapshot.slots.find((slot) => slot.id === oreSlot!.id);
    expect(swappedSource?.occupantId).toBe('resource.ore');
    expect(swappedSource?.stackCount).toBe(4);
    expect(swappedTarget?.occupantId).toBe('resource.scrap');
    expect(swappedTarget?.stackCount).toBe(6);
  });

  it('updates slot metadata and provides resolved slot snapshots', () => {
    const store = new InventoryStore();
    const initialSlot = store.getSlot('inventory-0');
    expect(initialSlot?.metadata.locked).toBe(false);
    expect(initialSlot?.metadata.stackable).toBe(true);

    const updated = store.setSlotMetadata('inventory-0', { locked: true, stackable: false });
    expect(updated?.metadata.locked).toBe(true);
    expect(updated?.metadata.stackable).toBe(false);

    const nextSnapshot = store.getSlot('inventory-0');
    expect(nextSnapshot?.metadata.locked).toBe(true);
    expect(nextSnapshot?.metadata.stackable).toBe(false);
  });
});

