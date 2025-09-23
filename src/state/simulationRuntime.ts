import type { RootScene } from '../simulation/rootScene';
import type { CompiledProgram } from '../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import { DEFAULT_STARTUP_PROGRAM } from '../simulation/runtime/defaultProgram';
import type { SimulationTelemetrySnapshot } from '../simulation/runtime/ecsBlackboard';
import type { InventorySnapshot } from '../simulation/robot/inventory';

type StatusListener = (status: ProgramRunnerStatus) => void;
type InventoryListener = (snapshot: InventorySnapshot) => void;
type SelectionListener = (selectedRobotId: string | null) => void;
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
  private pendingProgram: CompiledProgram | null = null;
  private readonly listeners = new Set<StatusListener>();
  private readonly inventoryListeners = new Set<InventoryListener>();
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly telemetryListeners = new Set<TelemetryListener>();
  private unsubscribeScene: (() => void) | null = null;
  private sceneInventoryUnsubscribe: (() => void) | null = null;
  private sceneTelemetryUnsubscribe: (() => void) | null = null;
  private status: ProgramRunnerStatus = 'idle';
  private inventorySnapshot: InventorySnapshot = EMPTY_INVENTORY_SNAPSHOT;
  private telemetrySnapshot: SimulationTelemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
  private telemetryRobotId: string | null = null;
  private readonly telemetrySnapshots = new Map<string, SimulationTelemetrySnapshot>();
  private selectedRobotId: string | null = null;
  private hasAutoStarted = false;

  registerScene(scene: RootScene): void {
    if (this.scene === scene) {
      return;
    }

    this.unsubscribeScene?.();
    this.teardownInventorySubscription();
    this.sceneTelemetryUnsubscribe?.();
    this.telemetrySnapshots.clear();
    this.scene = scene;
    this.unsubscribeScene = scene.subscribeProgramStatus((nextStatus) => {
      this.updateStatus(nextStatus);
    });
    this.updateStatus(scene.getProgramStatus());
    this.updateInventorySnapshot(scene.getInventorySnapshot());
    this.ensureInventorySubscription();
    this.sceneTelemetryUnsubscribe = scene.subscribeTelemetry((snapshot, robotId) => {
      this.handleSceneTelemetry(snapshot, robotId);
    });
    this.handleSceneTelemetry(scene.getTelemetrySnapshot(), scene.getSelectedRobot());
    if (this.selectedRobotId !== null) {
      scene.selectRobot(this.selectedRobotId);
    }

    if (!this.pendingProgram && !this.hasAutoStarted) {
      scene.runProgram(DEFAULT_STARTUP_PROGRAM);
      this.hasAutoStarted = true;
    }

    if (this.pendingProgram) {
      scene.runProgram(this.pendingProgram);
      this.pendingProgram = null;
    }
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
    this.pendingProgram = null;
    this.updateStatus('idle');
    this.updateInventorySnapshot(EMPTY_INVENTORY_SNAPSHOT);
    this.updateTelemetrySnapshot(EMPTY_TELEMETRY_SNAPSHOT, null);
    this.telemetrySnapshots.clear();
    this.updateSelectedRobot(null);
    this.hasAutoStarted = false;
  }

  runProgram(program: CompiledProgram): void {
    if (this.scene) {
      this.scene.runProgram(program);
      return;
    }
    this.pendingProgram = program;
  }

  stopProgram(): void {
    this.pendingProgram = null;
    if (this.scene) {
      this.scene.stopProgram();
    } else {
      this.updateStatus('idle');
    }
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): ProgramRunnerStatus {
    return this.status;
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
    listener(this.telemetrySnapshot, this.telemetryRobotId);
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
    listener(this.selectedRobotId);
    return () => {
      this.selectionListeners.delete(listener);
    };
  }

  getSelectedRobot(): string | null {
    return this.selectedRobotId;
  }

  setSelectedRobot(robotId: string): void {
    this.scene?.selectRobot(robotId);
    this.updateSelectedRobot(robotId);
    this.applyTelemetryForSelection(robotId);
  }

  clearSelectedRobot(): void {
    this.scene?.clearRobotSelection();
    this.updateSelectedRobot(null);
    this.applyTelemetryForSelection(null);
  }

  private updateStatus(status: ProgramRunnerStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
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

  private updateSelectedRobot(selectedRobotId: string | null): void {
    if (this.selectedRobotId === selectedRobotId) {
      return;
    }
    this.selectedRobotId = selectedRobotId;
    for (const listener of this.selectionListeners) {
      listener(selectedRobotId);
    }
  }

  private handleSceneTelemetry(
    snapshot: SimulationTelemetrySnapshot,
    robotId: string | null,
  ): void {
    if (robotId) {
      this.telemetrySnapshots.set(robotId, snapshot);
    }
    const effectiveRobotId = robotId ?? this.selectedRobotId;
    if (effectiveRobotId === this.selectedRobotId) {
      this.updateTelemetrySnapshot(snapshot, effectiveRobotId ?? null);
    }
  }

  private applyTelemetryForSelection(robotId: string | null): void {
    if (robotId) {
      const cached = this.telemetrySnapshots.get(robotId);
      if (cached) {
        this.updateTelemetrySnapshot(cached, robotId);
        return;
      }
      if (this.scene) {
        this.updateTelemetrySnapshot(this.scene.getTelemetrySnapshot(), robotId);
        return;
      }
      this.updateTelemetrySnapshot(EMPTY_TELEMETRY_SNAPSHOT, robotId);
      return;
    }
    this.updateTelemetrySnapshot(EMPTY_TELEMETRY_SNAPSHOT, null);
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
    this.notifyTelemetryListeners();
  }

  private notifyTelemetryListeners(): void {
    for (const listener of this.telemetryListeners) {
      listener(this.telemetrySnapshot, this.telemetryRobotId);
    }
  }
}

export const simulationRuntime = new SimulationRuntime();
