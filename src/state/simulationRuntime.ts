import type { RootScene } from '../simulation/rootScene';
import type { CompiledProgram, Diagnostic } from '../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import { DEFAULT_STARTUP_PROGRAM } from '../simulation/runtime/defaultProgram';
import { DEFAULT_ROBOT_ID } from '../simulation/runtime/simulationWorld';
import type { SimulationTelemetrySnapshot } from '../simulation/runtime/ecsBlackboard';
import type { InventoryEntry, InventorySnapshot } from '../simulation/robot/inventory';
import type { ChassisSnapshot } from '../simulation/robot';
import type { EntityId } from '../simulation/ecs/world';
import type { SlotSchema } from '../types/slots';

type StatusListener = (status: ProgramRunnerStatus) => void;
type InventoryListener = (snapshot: InventorySnapshot) => void;
type SelectionListener = (selection: { robotId: string | null; entityId: EntityId | null }) => void;
type TelemetryListener = (
  snapshot: SimulationTelemetrySnapshot,
  robotId: string | null,
) => void;
type ChassisListener = (snapshot: ChassisSnapshot) => void;

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
  private readonly statusByRobot = new Map<string, ProgramRunnerStatus>();
  private readonly inventoryListeners = new Set<InventoryListener>();
  private readonly chassisListeners = new Set<ChassisListener>();
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly telemetryListeners = new Set<TelemetryListener>();
  private unsubscribeScene: (() => void) | null = null;
  private sceneInventoryUnsubscribe: (() => void) | null = null;
  private sceneChassisUnsubscribe: (() => void) | null = null;
  private sceneTelemetryUnsubscribe: (() => void) | null = null;
  private inventorySnapshot: InventorySnapshot = EMPTY_INVENTORY_SNAPSHOT;
  private chassisSnapshot: ChassisSnapshot = EMPTY_CHASSIS_SNAPSHOT;
  private telemetrySnapshot: SimulationTelemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
  private telemetryRobotId: string | null = null;
  private readonly telemetrySnapshots = new Map<string, SimulationTelemetrySnapshot>();
  private selectedRobotId: string | null = null;
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
    this.telemetrySnapshots.clear();
    this.scene = scene;
    this.unsubscribeScene = scene.subscribeProgramStatus((nextStatus, robotId) => {
      this.updateStatus(robotId, nextStatus);
    });

    const activeRobotId = this.selectedRobotId ?? DEFAULT_ROBOT_ID;
    this.updateInventorySnapshot(scene.getInventorySnapshot(activeRobotId));
    this.ensureInventorySubscription();
    this.updateChassisSnapshot(scene.getChassisSnapshot(activeRobotId));
    this.ensureChassisSubscription();
    this.sceneTelemetryUnsubscribe = scene.subscribeTelemetry((snapshot, robotId) => {
      this.handleSceneTelemetry(snapshot, robotId);
    });
    this.handleSceneTelemetry(scene.getTelemetrySnapshot(activeRobotId), activeRobotId);
    if (this.selectedRobotId !== null) {
      scene.selectRobot(this.selectedRobotId);
    }

    if (!this.pendingPrograms.has(DEFAULT_ROBOT_ID) && !this.hasAutoStartedDefault) {
      scene.runProgram(DEFAULT_ROBOT_ID, DEFAULT_STARTUP_PROGRAM);
      this.hasAutoStartedDefault = true;
    }

    for (const [robotId, program] of this.pendingPrograms) {
      scene.runProgram(robotId, program);
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
    this.scene = null;
    this.pendingPrograms.clear();
    for (const robotId of this.statusByRobot.keys()) {
      this.updateStatus(robotId, 'idle');
    }
    this.updateInventorySnapshot(EMPTY_INVENTORY_SNAPSHOT);
    this.updateChassisSnapshot(EMPTY_CHASSIS_SNAPSHOT);
    this.updateTelemetrySnapshot(EMPTY_TELEMETRY_SNAPSHOT, null);
    this.telemetrySnapshots.clear();
    this.updateSelectedRobot(null, null);
    this.hasAutoStartedDefault = false;
  }

  runProgram(robotId: string, program: CompiledProgram): void {
    const targetRobotId = this.normaliseRobotId(robotId);
    if (this.scene) {
      this.scene.runProgram(targetRobotId, program);
      return;
    }
    this.pendingPrograms.set(targetRobotId, program);
  }

  stopProgram(robotId: string): void {
    const targetRobotId = this.normaliseRobotId(robotId);
    this.pendingPrograms.delete(targetRobotId);
    if (this.scene) {
      this.scene.stopProgram(targetRobotId);
    } else {
      this.updateStatus(targetRobotId, 'idle');
    }
  }

  reportCompileDiagnostics(robotId: string, diagnostics: Diagnostic[]): void {
    const targetRobotId = this.normaliseRobotId(robotId);
    const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    if (hasErrors) {
      this.pendingPrograms.delete(targetRobotId);
      this.updateStatus(targetRobotId, 'error');
      return;
    }
    if (this.statusByRobot.get(targetRobotId) === 'error') {
      this.updateStatus(targetRobotId, 'idle');
    }
  }

  subscribeStatus(robotId: string, listener: StatusListener): () => void {
    const targetRobotId = this.normaliseRobotId(robotId);
    let listenersForRobot = this.statusListeners.get(targetRobotId);
    if (!listenersForRobot) {
      listenersForRobot = new Set();
      this.statusListeners.set(targetRobotId, listenersForRobot);
    }
    listenersForRobot.add(listener);
    listener(this.getStatus(targetRobotId));
    return () => {
      listenersForRobot?.delete(listener);
      if (listenersForRobot && listenersForRobot.size === 0) {
        this.statusListeners.delete(targetRobotId);
      }
    };
  }

  getStatus(robotId: string): ProgramRunnerStatus {
    const targetRobotId = this.normaliseRobotId(robotId);
    return this.statusByRobot.get(targetRobotId) ?? 'idle';
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

  getChassisSnapshot(robotId: string | null = this.selectedRobotId): ChassisSnapshot {
    const targetRobotId = this.normaliseRobotId(robotId);
    if (targetRobotId === this.normaliseRobotId(this.selectedRobotId)) {
      return this.chassisSnapshot;
    }
    if (this.scene) {
      return this.scene.getChassisSnapshot(targetRobotId);
    }
    return EMPTY_CHASSIS_SNAPSHOT;
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    if (this.telemetrySnapshots.size > 0) {
      for (const [robotId, snapshot] of this.telemetrySnapshots) {
        listener(snapshot, robotId);
      }
    } else {
      listener(this.telemetrySnapshot, this.telemetryRobotId);
    }
    return () => {
      this.telemetryListeners.delete(listener);
    };
  }

  getTelemetrySnapshot(robotId: string | null = this.selectedRobotId): SimulationTelemetrySnapshot {
    if (robotId) {
      if (robotId === this.telemetryRobotId) {
        return this.telemetrySnapshot;
      }
      return this.telemetrySnapshots.get(robotId) ?? EMPTY_TELEMETRY_SNAPSHOT;
    }
    return this.telemetrySnapshot;
  }

  subscribeSelectedRobot(listener: SelectionListener): () => void {
    this.selectionListeners.add(listener);
    listener({ robotId: this.selectedRobotId, entityId: this.selectedEntityId });
    return () => {
      this.selectionListeners.delete(listener);
    };
  }

  getSelectedRobot(): string | null {
    return this.selectedRobotId;
  }

  getSelectedEntityId(): EntityId | null {
    return this.selectedEntityId;
  }

  setSelectedRobot(robotId: string, entityId?: EntityId | null): void {
    this.scene?.selectRobot(robotId);
    this.updateSelectedRobot(robotId, entityId ?? null);
    this.applyTelemetryForSelection(robotId);
  }

  clearSelectedRobot(): void {
    this.scene?.clearRobotSelection();
    this.updateSelectedRobot(null, null);
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

  private normaliseRobotId(robotId: string | null | undefined): string {
    if (robotId && robotId.trim().length > 0) {
      return robotId;
    }
    return DEFAULT_ROBOT_ID;
  }

  private updateStatus(robotId: string, status: ProgramRunnerStatus): void {
    const targetRobotId = this.normaliseRobotId(robotId);
    const previousStatus = this.statusByRobot.get(targetRobotId) ?? 'idle';
    if (previousStatus === status) {
      return;
    }
    this.statusByRobot.set(targetRobotId, status);
    const listenersForRobot = this.statusListeners.get(targetRobotId);
    if (listenersForRobot) {
      for (const listener of listenersForRobot) {
        listener(status);
      }
    }
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

  private updateSelectedRobot(selectedRobotId: string | null, entityId: EntityId | null): void {
    if (this.selectedRobotId === selectedRobotId && this.selectedEntityId === entityId) {
      return;
    }
    this.selectedRobotId = selectedRobotId;
    this.selectedEntityId = entityId;
    this.applyChassisForSelection(selectedRobotId);
    for (const listener of this.selectionListeners) {
      listener({ robotId: selectedRobotId, entityId });
    }
  }

  private handleSceneTelemetry(
    snapshot: SimulationTelemetrySnapshot,
    robotId: string | null,
  ): void {
    if (!robotId) {
      const fallbackRobotId = this.selectedRobotId ?? DEFAULT_ROBOT_ID;
      this.updateTelemetrySnapshot(snapshot, fallbackRobotId);
      return;
    }
    const activeRobotId = this.selectedRobotId ?? DEFAULT_ROBOT_ID;
    this.telemetrySnapshots.set(robotId, snapshot);
    if (robotId === activeRobotId) {
      this.updateTelemetrySnapshot(snapshot, robotId);
      return;
    }
    this.notifyTelemetryListeners(snapshot, robotId);
  }

  private applyChassisForSelection(robotId: string | null): void {
    const targetRobotId = this.normaliseRobotId(robotId);
    if (this.scene) {
      this.updateChassisSnapshot(this.scene.getChassisSnapshot(targetRobotId));
      return;
    }
    this.updateChassisSnapshot(EMPTY_CHASSIS_SNAPSHOT);
  }

  private applyTelemetryForSelection(robotId: string | null): void {
    const targetRobotId = this.normaliseRobotId(robotId);
    const cached = this.telemetrySnapshots.get(targetRobotId);
    if (cached) {
      this.updateTelemetrySnapshot(cached, targetRobotId);
      return;
    }
    if (this.scene) {
      this.updateTelemetrySnapshot(this.scene.getTelemetrySnapshot(targetRobotId), targetRobotId);
      return;
    }
    this.updateTelemetrySnapshot(EMPTY_TELEMETRY_SNAPSHOT, targetRobotId);
  }

  private updateTelemetrySnapshot(
    snapshot: SimulationTelemetrySnapshot,
    robotId: string | null,
  ): void {
    this.telemetrySnapshot = snapshot;
    this.telemetryRobotId = robotId;
    if (robotId) {
      this.telemetrySnapshots.set(robotId, snapshot);
    }
    this.notifyTelemetryListeners(snapshot, robotId);
  }

  private notifyTelemetryListeners(
    snapshot: SimulationTelemetrySnapshot,
    robotId: string | null,
  ): void {
    for (const listener of this.telemetryListeners) {
      listener(snapshot, robotId);
    }
  }
}

export const simulationRuntime = new SimulationRuntime();
