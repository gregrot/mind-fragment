import type { RootScene } from '../simulation/rootScene';
import type { CompiledProgram } from '../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import type { InventorySnapshot } from '../simulation/robot/inventory';

type StatusListener = (status: ProgramRunnerStatus) => void;
type InventoryListener = (snapshot: InventorySnapshot) => void;
type SelectionListener = (selectedRobotId: string | null) => void;

const EMPTY_INVENTORY_SNAPSHOT: InventorySnapshot = {
  capacity: 0,
  used: 0,
  available: 0,
  entries: [],
};

class SimulationRuntime {
  private scene: RootScene | null = null;
  private pendingProgram: CompiledProgram | null = null;
  private readonly listeners = new Set<StatusListener>();
  private readonly inventoryListeners = new Set<InventoryListener>();
  private readonly selectionListeners = new Set<SelectionListener>();
  private unsubscribeScene: (() => void) | null = null;
  private sceneInventoryUnsubscribe: (() => void) | null = null;
  private status: ProgramRunnerStatus = 'idle';
  private inventorySnapshot: InventorySnapshot = EMPTY_INVENTORY_SNAPSHOT;
  private selectedRobotId: string | null = null;

  registerScene(scene: RootScene): void {
    if (this.scene === scene) {
      return;
    }

    this.unsubscribeScene?.();
    this.teardownInventorySubscription();
    this.scene = scene;
    this.unsubscribeScene = scene.subscribeProgramStatus((nextStatus) => {
      this.updateStatus(nextStatus);
    });
    this.updateStatus(scene.getProgramStatus());
    this.updateInventorySnapshot(scene.getInventorySnapshot());
    this.ensureInventorySubscription();
    if (this.selectedRobotId !== null) {
      scene.selectRobot(this.selectedRobotId);
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
    this.scene = null;
    this.pendingProgram = null;
    this.updateStatus('idle');
    this.updateInventorySnapshot(EMPTY_INVENTORY_SNAPSHOT);
    this.updateSelectedRobot(null);
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
  }

  clearSelectedRobot(): void {
    this.scene?.clearRobotSelection();
    this.updateSelectedRobot(null);
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
}

export const simulationRuntime = new SimulationRuntime();
