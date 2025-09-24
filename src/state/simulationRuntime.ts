import type { RootScene } from '../simulation/rootScene';
import type { CompiledProgram } from '../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import { DEFAULT_STARTUP_PROGRAM } from '../simulation/runtime/defaultProgram';
import { DEFAULT_ROBOT_ID } from '../simulation/runtime/simulationWorld';
import type { SimulationTelemetrySnapshot } from '../simulation/runtime/ecsBlackboard';
import type { InventorySnapshot } from '../simulation/robot/inventory';
import type { EntityId } from '../simulation/ecs/world';

type StatusListener = (status: ProgramRunnerStatus) => void;
type InventoryListener = (snapshot: InventorySnapshot) => void;
type SelectionListener = (selection: { robotId: string | null; entityId: EntityId | null }) => void;
type TelemetryListener = (
  snapshot: SimulationTelemetrySnapshot,
  robotId: string | null,
) => void;

const EMPTY_INVENTORY_SNAPSHOT: InventorySnapshot = {
  capacity: 0,
  used: 0,
  available: 0,
  entries: [],
};

const EMPTY_TELEMETRY_SNAPSHOT: SimulationTelemetrySnapshot = {
  values: {},
  actions: {},
};

class SimulationRuntime {
  private scene: RootScene | null = null;
  private readonly pendingPrograms = new Map<string, CompiledProgram>();
  private readonly statusListeners = new Map<string, Set<StatusListener>>();
  private readonly statusByRobot = new Map<string, ProgramRunnerStatus>();
  private readonly inventoryListeners = new Set<InventoryListener>();
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly telemetryListeners = new Set<TelemetryListener>();
  private unsubscribeScene: (() => void) | null = null;
  private sceneInventoryUnsubscribe: (() => void) | null = null;
  private sceneTelemetryUnsubscribe: (() => void) | null = null;
  private inventorySnapshot: InventorySnapshot = EMPTY_INVENTORY_SNAPSHOT;
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
    this.sceneTelemetryUnsubscribe?.();
    this.telemetrySnapshots.clear();
    this.scene = scene;
    this.unsubscribeScene = scene.subscribeProgramStatus((nextStatus, robotId) => {
      this.updateStatus(robotId, nextStatus);
    });

    const activeRobotId = this.selectedRobotId ?? DEFAULT_ROBOT_ID;
    this.updateInventorySnapshot(scene.getInventorySnapshot(activeRobotId));
    this.ensureInventorySubscription();
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
    this.sceneTelemetryUnsubscribe?.();
    this.sceneTelemetryUnsubscribe = null;
    this.scene = null;
    this.pendingPrograms.clear();
    for (const robotId of this.statusByRobot.keys()) {
      this.updateStatus(robotId, 'idle');
    }
    this.updateInventorySnapshot(EMPTY_INVENTORY_SNAPSHOT);
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

  private updateSelectedRobot(selectedRobotId: string | null, entityId: EntityId | null): void {
    if (this.selectedRobotId === selectedRobotId && this.selectedEntityId === entityId) {
      return;
    }
    this.selectedRobotId = selectedRobotId;
    this.selectedEntityId = entityId;
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
