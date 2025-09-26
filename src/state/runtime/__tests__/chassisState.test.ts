import { describe, expect, it, vi } from 'vitest';
import { ChassisState, EMPTY_CHASSIS_SNAPSHOT } from '../chassisState';
import type { SlotSchema } from '../../../types/slots';

const createSlot = (overrides: Partial<SlotSchema> = {}): SlotSchema => ({
  id: 'slot-0',
  index: 0,
  occupantId: null,
  metadata: { stackable: true, moduleSubtype: undefined, locked: false },
  stackCount: 1,
  ...overrides,
});

describe('ChassisState', () => {
  it('updates slots based on overlay data', () => {
    const state = new ChassisState();
    const snapshots: typeof EMPTY_CHASSIS_SNAPSHOT[] = [];

    state.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    state.applyOverlayUpdate({
      capacity: 3,
      slots: [createSlot({ index: 2 }), createSlot({ index: 0 }), createSlot({ index: 1 })],
    });

    expect(snapshots).toHaveLength(2);
    const [initial, updated] = snapshots;
    expect(initial).toEqual(EMPTY_CHASSIS_SNAPSHOT);
    expect(updated.capacity).toBe(3);
    expect(updated.slots.map((slot) => slot.index)).toEqual([0, 1, 2]);
  });

  it('runs activation handlers when listeners attach', () => {
    const state = new ChassisState();
    const onActive = vi.fn();
    const onInactive = vi.fn();

    state.setActivationHandlers({ onActive, onInactive });
    const unsubscribe = state.subscribe(() => {});

    expect(onActive).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(onInactive).toHaveBeenCalledTimes(1);
  });
});
