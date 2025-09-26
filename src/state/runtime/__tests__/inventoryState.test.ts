import { describe, expect, it, vi } from 'vitest';
import { InventoryState, EMPTY_INVENTORY_SNAPSHOT } from '../inventoryState';
import type { SlotSchema } from '../../../types/slots';

const createSlot = (overrides: Partial<SlotSchema> = {}): SlotSchema => ({
  id: 'slot-0',
  index: 0,
  occupantId: 'MF-RESOURCE',
  metadata: { stackable: true, moduleSubtype: undefined, locked: false },
  stackCount: 1,
  ...overrides,
});

describe('InventoryState', () => {
  it('notifies listeners with overlay updates', () => {
    const state = new InventoryState();
    const snapshots: typeof EMPTY_INVENTORY_SNAPSHOT[] = [];

    state.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    state.applyOverlayUpdate({
      capacity: 4,
      slots: [
        createSlot({ index: 2, occupantId: 'ORE', stackCount: 3 }),
        createSlot({ index: 0, occupantId: 'ORE', stackCount: 2 }),
        createSlot({ index: 1, occupantId: 'CRYSTAL', stackCount: 1 }),
      ],
    });

    expect(snapshots).toHaveLength(2);
    const [initial, updated] = snapshots;
    expect(initial).toEqual(EMPTY_INVENTORY_SNAPSHOT);
    expect(updated.capacity).toBe(6);
    expect(updated.used).toBe(6);
    expect(updated.available).toBe(0);
    const sortedEntries = [...updated.entries].sort((a, b) => a.resource.localeCompare(b.resource));
    expect(sortedEntries).toEqual([
      { resource: 'CRYSTAL', quantity: 1 },
      { resource: 'ORE', quantity: 5 },
    ]);
    expect(updated.slots.map((slot) => slot.index)).toEqual([0, 1, 2]);
  });

  it('invokes activation handlers when listeners change', () => {
    const state = new InventoryState();
    const onActive = vi.fn();
    const onInactive = vi.fn();

    state.setActivationHandlers({ onActive, onInactive });

    const unsubscribe = state.subscribe(() => {});
    expect(onActive).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(onInactive).toHaveBeenCalledTimes(1);
  });
});
