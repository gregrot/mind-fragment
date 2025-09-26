import { describe, expect, it, vi } from 'vitest';
import { TelemetryState, EMPTY_TELEMETRY_SNAPSHOT } from '../telemetryState';

const createValueEntry = (value: unknown) => ({
  value,
  metadata: {},
  revision: 1,
});

const createActionEntry = () => ({
  metadata: {},
  revision: 1,
});

const createSnapshot = (overrides: Partial<typeof EMPTY_TELEMETRY_SNAPSHOT> = {}) => ({
  values: {},
  actions: {},
  ...overrides,
});

describe('TelemetryState', () => {
  it('tracks the active mechanism snapshot', () => {
    const state = new TelemetryState();
    const listener = vi.fn();
    state.subscribe(listener);

    const nextSnapshot = createSnapshot({ values: { core: { signal: createValueEntry(42) } } });
    state.setActiveSnapshot(nextSnapshot, 'MF-01');

    expect(listener).toHaveBeenLastCalledWith(nextSnapshot, 'MF-01');
    expect(state.getSnapshot('MF-01')).toEqual(nextSnapshot);
  });

  it('stores snapshots for inactive mechanisms', () => {
    const state = new TelemetryState();
    const listener = vi.fn();
    state.subscribe(listener);

    const cachedSnapshot = createSnapshot({ actions: { drive: { thrust: createActionEntry() } } });
    state.storeSnapshot(cachedSnapshot, 'MF-02');

    expect(listener).toHaveBeenLastCalledWith(cachedSnapshot, 'MF-02');
    expect(state.getSnapshot('MF-02')).toEqual(cachedSnapshot);
  });

  it('activates cached snapshots before fetching', () => {
    const state = new TelemetryState();
    const cachedSnapshot = createSnapshot({ values: { core: { power: createValueEntry(12) } } });
    state.storeSnapshot(cachedSnapshot, 'MF-03');

    const fetchSnapshot = vi.fn(() => createSnapshot({ values: { core: { power: createValueEntry(8) } } }));
    state.activateMechanism('MF-03', fetchSnapshot);

    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(state.getSnapshot('MF-03')).toEqual(cachedSnapshot);

    state.activateMechanism('MF-04', fetchSnapshot);
    expect(fetchSnapshot).toHaveBeenCalledWith('MF-04');
    expect(state.getSnapshot('MF-04')).toEqual(fetchSnapshot.mock.results[0].value);
  });

  it('clears cached telemetry when requested', () => {
    const state = new TelemetryState();
    const listener = vi.fn();
    state.subscribe(listener);

    state.setActiveSnapshot(createSnapshot({ values: { core: { signal: createValueEntry(1) } } }), 'MF-01');
    state.storeSnapshot(createSnapshot({ values: { core: { signal: createValueEntry(2) } } }), 'MF-02');

    state.clear();

    expect(listener).toHaveBeenLastCalledWith(EMPTY_TELEMETRY_SNAPSHOT, null);
    expect(state.getSnapshot('MF-01')).toEqual(EMPTY_TELEMETRY_SNAPSHOT);
    expect(state.getSnapshot('MF-02')).toEqual(EMPTY_TELEMETRY_SNAPSHOT);
  });
});
