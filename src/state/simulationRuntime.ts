import type { RootScene } from '../simulation/rootScene';
import type { CompiledProgram, Diagnostic } from '../simulation/runtime/blockProgram';
import type { ProgramDebugState, ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import { DEFAULT_STARTUP_PROGRAM } from '../simulation/runtime/defaultProgram';
import type { SimulationTelemetrySnapshot } from '../simulation/runtime/ecsBlackboard';
import { DEFAULT_MECHANISM_ID } from '../simulation/runtime/simulationWorld';
import type { EntityId } from '../simulation/ecs/world';
import type { InventorySnapshot } from '../simulation/mechanism/inventory';
import type { ChassisSnapshot } from '../simulation/mechanism';
import {
  chassisState,
  type ChassisListener,
  type ChassisOverlayUpdate,
  EMPTY_CHASSIS_SNAPSHOT,
  inventoryState,
  type InventoryListener,
  type InventoryOverlayUpdate,
  telemetryState,
  type TelemetryListener,
  EMPTY_TELEMETRY_SNAPSHOT,
} from './runtime';

type StatusListener = (status: ProgramRunnerStatus) => void;
type SelectionListener = (selection: { mechanismId: string | null; entityId: EntityId | null }) => void;
type DebugListener = (state: ProgramDebugState) => void;

const EMPTY_PROGRAM_DEBUG_STATE: ProgramDebugState = {
  status: 'idle',
  program: null,
  currentInstruction: null,
  timeRemaining: 0,
  frames: [],
};

class SimulationRuntime {
  private scene: RootScene | null = null;
  private readonly pendingPrograms = new Map<string, CompiledProgram>();
  private readonly statusListeners = new Map<string, Set<StatusListener>>();
  private readonly statusByMechanism = new Map<string, ProgramRunnerStatus>();
  private readonly debugListeners = new Map<string, Set<DebugListener>>();
  private readonly debugStateByMechanism = new Map<string, ProgramDebugState>();
  private readonly selectionListeners = new Set<SelectionListener>();
  private unsubscribeScene: (() => void) | null = null;
  private sceneInventoryUnsubscribe: (() => void) | null = null;
  private sceneChassisUnsubscribe: (() => void) | null = null;
  private sceneTelemetryUnsubscribe: (() => void) | null = null;
  private sceneDebugUnsubscribe: (() => void) | null = null;
  private debugState: ProgramDebugState = EMPTY_PROGRAM_DEBUG_STATE;
  private selectedMechanismId: string | null = null;
  private selectedEntityId: EntityId | null = null;
  private hasAutoStartedDefault = false;

  constructor() {
    inventoryState.setActivationHandlers({
      onActive: () => this.ensureInventorySubscription(),
      onInactive: () => this.teardownInventorySubscription(),
    });
    chassisState.setActivationHandlers({
      onActive: () => this.ensureChassisSubscription(),
      onInactive: () => this.teardownChassisSubscription(),
    });
  }

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
    telemetryState.clear();
    this.debugStateByMechanism.clear();
    this.debugState = EMPTY_PROGRAM_DEBUG_STATE;
    this.scene = scene;
    this.unsubscribeScene = scene.subscribeProgramStatus((nextStatus, mechanismId) => {
      this.updateStatus(mechanismId, nextStatus);
    });
    const activeMechanismId = this.selectedMechanismId ?? DEFAULT_MECHANISM_ID;
    inventoryState.setSnapshot(scene.getInventorySnapshot(activeMechanismId));
    this.ensureInventorySubscription();
    chassisState.setSnapshot(scene.getChassisSnapshot(activeMechanismId));
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
    inventoryState.clear();
    chassisState.clear();
    telemetryState.clear();
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
    return inventoryState.subscribe(listener);
  }

  getInventorySnapshot(): InventorySnapshot {
    return inventoryState.getSnapshot();
  }

  subscribeChassis(listener: ChassisListener): () => void {
    return chassisState.subscribe(listener);
  }

  getChassisSnapshot(mechanismId: string | null = this.selectedMechanismId): ChassisSnapshot {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    if (targetMechanismId === this.normaliseMechanismId(this.selectedMechanismId)) {
      return chassisState.getSnapshot();
    }
    if (this.scene) {
      return this.scene.getChassisSnapshot(targetMechanismId);
    }
    return EMPTY_CHASSIS_SNAPSHOT;
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    return telemetryState.subscribe(listener);
  }

  getTelemetrySnapshot(mechanismId: string | null = this.selectedMechanismId): SimulationTelemetrySnapshot {
    const targetMechanismId =
      mechanismId ?? this.normaliseMechanismId(this.selectedMechanismId);
    return telemetryState.getSnapshot(targetMechanismId);
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
    inventoryState.applyOverlayUpdate(update);
  }

  applyChassisOverlayUpdate(update: ChassisOverlayUpdate): void {
    chassisState.applyOverlayUpdate(update);
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
    inventoryState.setSnapshot(snapshot);
  }

  private ensureInventorySubscription(): void {
    if (!this.scene || !inventoryState.hasListeners() || this.sceneInventoryUnsubscribe) {
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
    chassisState.setSnapshot(snapshot);
  }

  private ensureChassisSubscription(): void {
    if (!this.scene || !chassisState.hasListeners() || this.sceneChassisUnsubscribe) {
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
      const fallbackMechanismId = this.normaliseMechanismId(this.selectedMechanismId);
      telemetryState.setActiveSnapshot(snapshot, fallbackMechanismId);
      return;
    }
    const activeMechanismId = this.normaliseMechanismId(this.selectedMechanismId);
    if (mechanismId === activeMechanismId) {
      telemetryState.setActiveSnapshot(snapshot, mechanismId);
      return;
    }
    telemetryState.storeSnapshot(snapshot, mechanismId);
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
    chassisState.clear();
  }

  private applyTelemetryForSelection(mechanismId: string | null): void {
    const targetMechanismId = this.normaliseMechanismId(mechanismId);
    telemetryState.activateMechanism(targetMechanismId, (target) => {
      if (!target || !this.scene) {
        return EMPTY_TELEMETRY_SNAPSHOT;
      }
      return this.scene.getTelemetrySnapshot(target);
    });
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
