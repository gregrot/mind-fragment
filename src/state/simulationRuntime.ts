import type { RootScene } from '../simulation/rootScene';
import type { CompiledProgram, Diagnostic } from '../simulation/runtime/blockProgram';
import type { ProgramDebugState, ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import { DEFAULT_STARTUP_PROGRAM } from '../simulation/runtime/defaultProgram';
import { DEFAULT_MECHANISM_ID } from '../simulation/runtime/simulationWorld';
import type { SimulationTelemetrySnapshot } from '../simulation/runtime/ecsBlackboard';
import type { InventoryEntry, InventorySnapshot } from '../simulation/mechanism/inventory';
import type { ChassisSnapshot } from '../simulation/mechanism';
import type { EntityId } from '../simulation/ecs/world';
import type { SlotSchema } from '../types/slots';

type StatusListener = (status: ProgramRunnerStatus) => void;
type InventoryListener = (snapshot: InventorySnapshot) => void;
type SelectionListener = (selection: { mechanismId: string | null; entityId: EntityId | null }) => void;
type TelemetryListener = (
  snapshot: SimulationTelemetrySnapshot,
  mechanismId: string | null,
) => void;
type ChassisListener = (snapshot: ChassisSnapshot) => void;
type DebugListener = (state: ProgramDebugState) => void;

const EMPTY_INVENTORY_SNAPSHOT: InventorySnapshot = {
  capacity: 0,
  used: 0,
  available: 0,
  entries: [],
  slots: [],
  slotCapacity: 0,
};

const EMPTY_TELEMETRY_SNAPSHOT: SimulationTelemetrySnapshot = {
  values: {},
  actions: {},
};

const EMPTY_CHASSIS_SNAPSHOT: ChassisSnapshot = {
  capacity: 0,
  slots: [],
};

const EMPTY_PROGRAM_DEBUG_STATE: ProgramDebugState = {
  status: 'idle',
  program: null,
  currentInstruction: null,
  timeRemaining: 0,
  frames: [],
};

interface InventoryOverlayUpdate {
  capacity: number;
  slots: SlotSchema[];
}

interface ChassisOverlayUpdate {
  capacity: number;
  slots: SlotSchema[];
}

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

class SimulationRuntime {
  private scene: RootScene | null = null;
  private readonly pendingPrograms = new Map<string, CompiledProgram>();
  private readonly statusListeners = new Map<string, Set<StatusListener>>();
  private readonly statusByMechanism = new Map<string, ProgramRunnerStatus>();
  private readonly debugListeners = new Map<string, Set<DebugListener>>();
  private readonly debugStateByMechanism = new Map<string, ProgramDebugState>();
  private readonly inventoryListeners = new Set<InventoryListener>();
  private readonly chassisListeners = new Set<ChassisListener>();
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly telemetryListeners = new Set<TelemetryListener>();
  private unsubscribeScene: (() => void) | null = null;
  private sceneInventoryUnsubscribe: (() => void) | null = null;
  private sceneChassisUnsubscribe: (() => void) | null = null;
  private sceneTelemetryUnsubscribe: (() => void) | null = null;
  private sceneDebugUnsubscribe: (() => void) | null = null;
  private inventorySnapshot: InventorySnapshot = EMPTY_INVENTORY_SNAPSHOT;
  private chassisSnapshot: ChassisSnapshot = EMPTY_CHASSIS_SNAPSHOT;
  private telemetrySnapshot: SimulationTelemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
  private telemetryMechanismId: string | null = null;
  private readonly telemetrySnapshots = new Map<string, SimulationTelemetrySnapshot>();
  private debugState: ProgramDebugState = EMPTY_PROGRAM_DEBUG_STATE;
  private selectedMechanismId: string | null = null;
  private selectedEntityId: EntityId | null = null;
  private hasAutoStartedDefault = false;

  registerScene(scene: RootScene): void {
    if (this.scene === scene) {
      return;
    }

    this.unsubscribeScene?.();
    this.teardownInventorySubscription();
    this.teardownChassisSubscription();
    this.sceneTelemetryUnsubscribe?.();
    this.sceneDebugUnsubscribe?.();
    this.sceneDebugUnsubscribe = null;
    this.telemetrySnapshots.clear();
    this.debugStateByMechanism.clear();
    this.debugState = EMPTY_PROGRAM_DEBUG_STATE;
    this.scene = scene;
    this.unsubscribeScene = scene.subscribeProgramStatus((nextStatus, mechanismId) => {
      this.updateStatus(mechanismId, nextStatus);
    });

    const activeMechanismId = this.selectedMechanismId ?? DEFAULT_MECHANISM_ID;
    this.updateInventorySnapshot(scene.getInventorySnapshot(activeMechanismId));
    this.ensureInventorySubscription();
    this.updateChassisSnapshot(scene.getChassisSnapshot(activeMechanismId));
    this.ensureChassisSubscription();
    this.sceneTelemetryUnsubscribe = scene.subscribeTelemetry((snapshot, mechanismId) => {
      this.handleSceneTelemetry(snapshot, mechanismId);
    });
    this.sceneDebugUnsubscribe = scene.subscribeProgramDebug((state, mechanismId) => {
      this.handleSceneProgramDebug(state, mechanismId);
    });
    this.handleSceneTelemetry(scene.getTelemetrySnapshot(activeMechanismId), activeMechanismId);
    this.handleSceneProgramDebug(scene.getProgramDebugState(activeMechanismId), activeMechanismId);
    if (this.selectedMechanismId !== null) {
      scene.selectMechanism(this.selectedMechanismId);
    }

    if (!this.pendingPrograms.has(DEFAULT_MECHANISM_ID) && !this.hasAutoStartedDefault) {
      scene.runProgram(DEFAULT_MECHANISM_ID, DEFAULT_STARTUP_PROGRAM);
      this.hasAutoStartedDefault = true;
    }

    for (const [mechanismId, program] of this.pendingPrograms) {
      scene.runProgram(mechanismId, program);
    }
    this.pendingPrograms.clear();
  }

  unregisterScene(scene: RootScene): void {
    if (this.scene !== scene) {
      return;
    }

    this.unsubscribeScene?.();
    this.unsubscribeScene = null;
    this.teardownInventorySubscription();
    this.teardownChassisSubscription();
    this.sceneTelemetryUnsubscribe?.();
    this.sceneTelemetryUnsubscribe = null;
    this.sceneDebugUnsubscribe?.();
    this.sceneDebugUnsubscribe = null;
    this.scene = null;
    this.pendingPrograms.clear();
    for (const mechanismId of this.statusByMechanism.keys()) {
      this.updateStatus(mechanismId, 'idle');
    }
    this.updateInventorySnapshot(EMPTY_INVENTORY_SNAPSHOT);
    this.updateChassisSnapshot(EMPTY_CHASSIS_SNAPSHOT);
    this.updateTelemetrySnapshot(EMPTY_TELEMETRY_SNAPSHOT, null);
    this.telemetrySnapshots.clear();
    this.debugStateByMechanism.clear();
    this.debugState = EMPTY_PROGRAM_DEBUG_STATE;
    this.updateSelectedMechanism(null, null);
    this.hasAutoStartedDefault = false;
  }

  runProgram(mechanismId: string, program: CompiledProgram): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    if (this.scene) {
      this.scene.runProgram(targetMechanismId, program);
      return;
    }
    this.pendingPrograms.set(targetMechanismId, program);
  }

  stopProgram(mechanismId: string): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    this.pendingPrograms.delete(targetMechanismId);
    if (this.scene) {
      this.scene.stopProgram(targetMechanismId);
    } else {
      this.updateStatus(targetMechanismId, 'idle');
      this.updateDebugState(targetMechanismId, EMPTY_PROGRAM_DEBUG_STATE);
    }
  }

  reportCompileDiagnostics(mechanismId: string, diagnostics: Diagnostic[]): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    if (hasErrors) {
      this.pendingPrograms.delete(targetMechanismId);
      this.updateStatus(targetMechanismId, 'error');
      return;
    }
    if (this.statusByMechanism.get(targetMechanismId) === 'error') {
      this.updateStatus(targetMechanismId, 'idle');
    }
  }

  subscribeStatus(mechanismId: string, listener: StatusListener): () => void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    let listenersForMechanism = this.statusListeners.get(targetMechanismId);
    if (!listenersForMechanism) {
      listenersForMechanism = new Set();
      this.statusListeners.set(targetMechanismId, listenersForMechanism);
    }
    listenersForMechanism.add(listener);
    listener(this.getStatus(targetMechanismId));
    return () => {
      listenersForMechanism?.delete(listener);
      if (listenersForMechanism && listenersForMechanism.size === 0) {
        this.statusListeners.delete(targetMechanismId);
      }
    };
  }

  getStatus(mechanismId: string): ProgramRunnerStatus {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    return this.statusByMechanism.get(targetMechanismId) ?? 'idle';
  }

  subscribeProgramDebug(mechanismId: string, listener: DebugListener): () => void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    let listenersForMechanism = this.debugListeners.get(targetMechanismId);
    if (!listenersForMechanism) {
      listenersForMechanism = new Set();
      this.debugListeners.set(targetMechanismId, listenersForMechanism);
    }
    listenersForMechanism.add(listener);
    listener(this.getProgramDebugState(targetMechanismId));
    return () => {
      listenersForMechanism?.delete(listener);
      if (listenersForMechanism && listenersForMechanism.size === 0) {
        this.debugListeners.delete(targetMechanismId);
      }
    };
  }

  getProgramDebugState(mechanismId: string): ProgramDebugState {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    if (targetMechanismId === this.normaliseMechanismId(this.selectedMechanismId)) {
      return this.debugState;
    }
    return this.debugStateByMechanism.get(targetMechanismId) ?? EMPTY_PROGRAM_DEBUG_STATE;
  }

  subscribeInventory(listener: InventoryListener): () => void {
    this.inventoryListeners.add(listener);
    listener(this.inventorySnapshot);
    this.ensureInventorySubscription();
    return () => {
      this.inventoryListeners.delete(listener);
      if (this.inventoryListeners.size === 0) {
        this.teardownInventorySubscription();
      }
    };
  }

  getInventorySnapshot(): InventorySnapshot {
    return this.inventorySnapshot;
  }

  subscribeChassis(listener: ChassisListener): () => void {
    this.chassisListeners.add(listener);
    listener(this.chassisSnapshot);
    this.ensureChassisSubscription();
    return () => {
      this.chassisListeners.delete(listener);
      if (this.chassisListeners.size === 0) {
        this.teardownChassisSubscription();
      }
    };
  }

  getChassisSnapshot(mechanismId: string | null = this.selectedMechanismId): ChassisSnapshot {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    if (targetMechanismId === this.normaliseMechanismId(this.selectedMechanismId)) {
      return this.chassisSnapshot;
    }
    if (this.scene) {
      return this.scene.getChassisSnapshot(targetMechanismId);
    }
    return EMPTY_CHASSIS_SNAPSHOT;
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    if (this.telemetrySnapshots.size > 0) {
      for (const [mechanismId, snapshot] of this.telemetrySnapshots) {
        listener(snapshot, mechanismId);
      }
    } else {
      listener(this.telemetrySnapshot, this.telemetryMechanismId);
    }
    return () => {
      this.telemetryListeners.delete(listener);
    };
  }

  getTelemetrySnapshot(mechanismId: string | null = this.selectedMechanismId): SimulationTelemetrySnapshot {
    if (mechanismId) {
      if (mechanismId === this.telemetryMechanismId) {
        return this.telemetrySnapshot;
      }
      return this.telemetrySnapshots.get(mechanismId) ?? EMPTY_TELEMETRY_SNAPSHOT;
    }
    return this.telemetrySnapshot;
  }

  subscribeSelectedMechanism(listener: SelectionListener): () => void {
    this.selectionListeners.add(listener);
    listener({ mechanismId: this.selectedMechanismId, entityId: this.selectedEntityId });
    return () => {
      this.selectionListeners.delete(listener);
    };
  }

  getSelectedMechanism(): string | null {
    return this.selectedMechanismId;
  }

  getSelectedEntityId(): EntityId | null {
    return this.selectedEntityId;
  }

  setSelectedMechanism(mechanismId: string, entityId?: EntityId | null): void {
    this.scene?.selectMechanism(mechanismId);
    this.updateSelectedMechanism(mechanismId, entityId ?? null);
    this.applyTelemetryForSelection(mechanismId);
  }

  clearSelectedMechanism(): void {
    this.scene?.clearMechanismSelection();
    this.updateSelectedMechanism(null, null);
    this.applyTelemetryForSelection(null);
  }

  applyInventoryOverlayUpdate(update: InventoryOverlayUpdate): void {
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
    this.updateInventorySnapshot(snapshot);
  }

  applyChassisOverlayUpdate(update: ChassisOverlayUpdate): void {
    const slots = update.slots.map((slot) => normaliseSlot(slot)).sort((a, b) => a.index - b.index);
    const snapshot: ChassisSnapshot = {
      capacity: Math.max(update.capacity, 0),
      slots,
    };
    this.updateChassisSnapshot(snapshot);
  }

  private normaliseMechanismId(mechanismId: string | null | undefined): string {
    if (mechanismId && mechanismId.trim().length > 0) {
      return mechanismId;
    }
    return DEFAULT_MECHANISM_ID;
  }

  private updateStatus(mechanismId: string, status: ProgramRunnerStatus): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    const previousStatus = this.statusByMechanism.get(targetMechanismId) ?? 'idle';
    if (previousStatus === status) {
      return;
    }
    this.statusByMechanism.set(targetMechanismId, status);
    const listenersForMechanism = this.statusListeners.get(targetMechanismId);
    if (listenersForMechanism) {
      for (const listener of listenersForMechanism) {
        listener(status);
      }
    }
  }

  private updateDebugState(mechanismId: string, state: ProgramDebugState): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    this.debugStateByMechanism.set(targetMechanismId, state);
    if (targetMechanismId === this.normaliseMechanismId(this.selectedMechanismId)) {
      this.debugState = state;
    }
    this.notifyDebugListeners(state, targetMechanismId);
  }

  private updateInventorySnapshot(snapshot: InventorySnapshot): void {
    this.inventorySnapshot = snapshot;
    for (const listener of this.inventoryListeners) {
      listener(snapshot);
    }
  }

  private ensureInventorySubscription(): void {
    if (!this.scene || this.inventoryListeners.size === 0 || this.sceneInventoryUnsubscribe) {
      return;
    }
    this.sceneInventoryUnsubscribe = this.scene.subscribeInventory((snapshot) => {
      this.updateInventorySnapshot(snapshot);
    });
  }

  private teardownInventorySubscription(): void {
    if (this.sceneInventoryUnsubscribe) {
      this.sceneInventoryUnsubscribe();
      this.sceneInventoryUnsubscribe = null;
    }
  }

  private updateChassisSnapshot(snapshot: ChassisSnapshot): void {
    this.chassisSnapshot = snapshot;
    for (const listener of this.chassisListeners) {
      listener(snapshot);
    }
  }

  private ensureChassisSubscription(): void {
    if (!this.scene || this.chassisListeners.size === 0 || this.sceneChassisUnsubscribe) {
      return;
    }
    this.sceneChassisUnsubscribe = this.scene.subscribeChassis((snapshot) => {
      this.updateChassisSnapshot(snapshot);
    });
  }

  private teardownChassisSubscription(): void {
    if (this.sceneChassisUnsubscribe) {
      this.sceneChassisUnsubscribe();
      this.sceneChassisUnsubscribe = null;
    }
  }

  private updateSelectedMechanism(selectedMechanismId: string | null, entityId: EntityId | null): void {
    if (this.selectedMechanismId === selectedMechanismId && this.selectedEntityId === entityId) {
      return;
    }
    this.selectedMechanismId = selectedMechanismId;
    this.selectedEntityId = entityId;
    this.applyChassisForSelection(selectedMechanismId);
    this.applyDebugForSelection(selectedMechanismId);
    for (const listener of this.selectionListeners) {
      listener({ mechanismId: selectedMechanismId, entityId });
    }
  }

  private handleSceneTelemetry(
    snapshot: SimulationTelemetrySnapshot,
    mechanismId: string | null,
  ): void {
    if (!mechanismId) {
      const fallbackMechanismId = this.selectedMechanismId ?? DEFAULT_MECHANISM_ID;
      this.updateTelemetrySnapshot(snapshot, fallbackMechanismId);
      return;
    }
    const activeMechanismId = this.selectedMechanismId ?? DEFAULT_MECHANISM_ID;
    this.telemetrySnapshots.set(mechanismId, snapshot);
    if (mechanismId === activeMechanismId) {
      this.updateTelemetrySnapshot(snapshot, mechanismId);
      return;
    }
    this.notifyTelemetryListeners(snapshot, mechanismId);
  }

  private handleSceneProgramDebug(state: ProgramDebugState, mechanismId: string): void {
    this.updateDebugState(mechanismId, state);
  }

  private applyChassisForSelection(mechanismId: string | null): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    if (this.scene) {
      this.updateChassisSnapshot(this.scene.getChassisSnapshot(targetMechanismId));
      return;
    }
    this.updateChassisSnapshot(EMPTY_CHASSIS_SNAPSHOT);
  }

  private applyTelemetryForSelection(mechanismId: string | null): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    const cached = this.telemetrySnapshots.get(targetMechanismId);
    if (cached) {
      this.updateTelemetrySnapshot(cached, targetMechanismId);
      return;
    }
    if (this.scene) {
      this.updateTelemetrySnapshot(this.scene.getTelemetrySnapshot(targetMechanismId), targetMechanismId);
      return;
    }
    this.updateTelemetrySnapshot(EMPTY_TELEMETRY_SNAPSHOT, targetMechanismId);
  }

  private applyDebugForSelection(mechanismId: string | null): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    let state = this.debugStateByMechanism.get(targetMechanismId);
    if (!state) {
      state = this.scene?.getProgramDebugState(targetMechanismId) ?? EMPTY_PROGRAM_DEBUG_STATE;
      this.debugStateByMechanism.set(targetMechanismId, state);
    }
    this.debugState = state;
    this.notifyDebugListeners(state, targetMechanismId);
  }

  private updateTelemetrySnapshot(
    snapshot: SimulationTelemetrySnapshot,
    mechanismId: string | null,
  ): void {
    this.telemetrySnapshot = snapshot;
    this.telemetryMechanismId = mechanismId;
    if (mechanismId) {
      this.telemetrySnapshots.set(mechanismId, snapshot);
    }
    this.notifyTelemetryListeners(snapshot, mechanismId);
  }

  private notifyTelemetryListeners(
    snapshot: SimulationTelemetrySnapshot,
    mechanismId: string | null,
  ): void {
    for (const listener of this.telemetryListeners) {
      listener(snapshot, mechanismId);
    }
  }

  private notifyDebugListeners(state: ProgramDebugState, mechanismId: string): void {
    const listenersForMechanism = this.debugListeners.get(mechanismId);
    if (!listenersForMechanism) {
      return;
    }
    for (const listener of listenersForMechanism) {
      listener(state);
    }
  }
}

export const simulationRuntime = new SimulationRuntime();
