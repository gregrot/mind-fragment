import type { SimulationTelemetrySnapshot } from '../../simulation/runtime/ecsBlackboard';

export type TelemetryListener = (snapshot: SimulationTelemetrySnapshot, mechanismId: string | null) => void;

const EMPTY_TELEMETRY_SNAPSHOT_INTERNAL: SimulationTelemetrySnapshot = {
  values: {},
  actions: {},
};

export const EMPTY_TELEMETRY_SNAPSHOT: SimulationTelemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT_INTERNAL;

export class TelemetryState {
  private activeSnapshot: SimulationTelemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT_INTERNAL;
  private activeMechanismId: string | null = null;
  private readonly snapshots = new Map<string, SimulationTelemetrySnapshot>();
  private readonly listeners = new Set<TelemetryListener>();

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    if (this.snapshots.size > 0) {
      for (const [mechanismId, snapshot] of this.snapshots) {
        listener(snapshot, mechanismId);
      }
    } else {
      listener(this.activeSnapshot, this.activeMechanismId);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(mechanismId: string | null = this.activeMechanismId): SimulationTelemetrySnapshot {
    if (mechanismId) {
      if (mechanismId === this.activeMechanismId) {
        return this.activeSnapshot;
      }
      return this.snapshots.get(mechanismId) ?? EMPTY_TELEMETRY_SNAPSHOT_INTERNAL;
    }
    return this.activeSnapshot;
  }

  setActiveSnapshot(snapshot: SimulationTelemetrySnapshot, mechanismId: string | null): void {
    this.activeSnapshot = snapshot;
    this.activeMechanismId = mechanismId;
    if (mechanismId) {
      this.snapshots.set(mechanismId, snapshot);
    }
    this.notify(snapshot, mechanismId);
  }

  storeSnapshot(snapshot: SimulationTelemetrySnapshot, mechanismId: string): void {
    if (mechanismId === this.activeMechanismId) {
      this.setActiveSnapshot(snapshot, mechanismId);
      return;
    }
    this.snapshots.set(mechanismId, snapshot);
    this.notify(snapshot, mechanismId);
  }

  activateMechanism(
    mechanismId: string | null,
    fetchSnapshot: (mechanismId: string | null) => SimulationTelemetrySnapshot,
  ): void {
    if (mechanismId && this.snapshots.has(mechanismId)) {
      this.setActiveSnapshot(this.snapshots.get(mechanismId) ?? EMPTY_TELEMETRY_SNAPSHOT_INTERNAL, mechanismId);
      return;
    }
    const snapshot = fetchSnapshot(mechanismId);
    this.setActiveSnapshot(snapshot, mechanismId);
  }

  clear(): void {
    this.activeSnapshot = EMPTY_TELEMETRY_SNAPSHOT_INTERNAL;
    this.activeMechanismId = null;
    this.snapshots.clear();
    this.notify(this.activeSnapshot, this.activeMechanismId);
  }

  private notify(snapshot: SimulationTelemetrySnapshot, mechanismId: string | null): void {
    for (const listener of this.listeners) {
      listener(snapshot, mechanismId);
    }
  }
}
