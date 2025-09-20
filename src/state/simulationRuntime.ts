import type { RootScene } from '../simulation/rootScene';
import type { CompiledProgram } from '../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';

type StatusListener = (status: ProgramRunnerStatus) => void;

class SimulationRuntime {
  private scene: RootScene | null = null;
  private pendingProgram: CompiledProgram | null = null;
  private readonly listeners = new Set<StatusListener>();
  private unsubscribeScene: (() => void) | null = null;
  private status: ProgramRunnerStatus = 'idle';

  registerScene(scene: RootScene): void {
    if (this.scene === scene) {
      return;
    }

    this.unsubscribeScene?.();
    this.scene = scene;
    this.unsubscribeScene = scene.subscribeProgramStatus((nextStatus) => {
      this.updateStatus(nextStatus);
    });
    this.updateStatus(scene.getProgramStatus());

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
    this.scene = null;
    this.pendingProgram = null;
    this.updateStatus('idle');
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

  private updateStatus(status: ProgramRunnerStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

export const simulationRuntime = new SimulationRuntime();
