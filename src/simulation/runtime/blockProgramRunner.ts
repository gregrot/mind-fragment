import type { RobotChassis } from '../robot';
import type { BlockInstruction, CompiledProgram } from './blockProgram';

export type ProgramRunnerStatus = 'idle' | 'running' | 'completed';

const MOVEMENT_MODULE_ID = 'core.movement';
const EPSILON = 1e-5;

export class BlockProgramRunner {
  private readonly robot: RobotChassis;
  private program: CompiledProgram | null = null;
  private currentInstruction: BlockInstruction | null = null;
  private currentIndex = -1;
  private timeRemaining = 0;
  private status: ProgramRunnerStatus = 'idle';
  private statusListener: ((status: ProgramRunnerStatus) => void) | null = null;

  constructor(robot: RobotChassis, onStatusChange?: (status: ProgramRunnerStatus) => void) {
    this.robot = robot;
    if (onStatusChange) {
      this.statusListener = onStatusChange;
    }
  }

  setStatusListener(listener: ((status: ProgramRunnerStatus) => void) | null): void {
    this.statusListener = listener;
    if (listener) {
      listener(this.status);
    }
  }

  getStatus(): ProgramRunnerStatus {
    return this.status;
  }

  load(program: CompiledProgram): void {
    this.program = program;
    this.currentInstruction = null;
    this.currentIndex = -1;
    this.timeRemaining = 0;
    this.resetMovement();

    if (!program.instructions || program.instructions.length === 0) {
      this.updateStatus('completed');
      return;
    }

    this.updateStatus('running');
    this.advanceInstruction();
  }

  stop(): void {
    this.program = null;
    this.currentInstruction = null;
    this.currentIndex = -1;
    this.timeRemaining = 0;
    this.resetMovement();
    this.updateStatus('idle');
  }

  update(stepSeconds: number): void {
    if (this.status !== 'running' || stepSeconds <= 0) {
      return;
    }

    if (!this.currentInstruction) {
      this.advanceInstruction();
      if (this.status !== 'running' || !this.currentInstruction) {
        return;
      }
    }

    let remaining = stepSeconds;
    while (remaining > 0 && this.status === 'running' && this.currentInstruction) {
      const delta = Math.min(remaining, this.timeRemaining);
      this.timeRemaining -= delta;
      remaining -= delta;

      if (this.timeRemaining <= EPSILON) {
        this.advanceInstruction();
      }

      if (this.status !== 'running') {
        break;
      }
    }
  }

  private advanceInstruction(): void {
    if (!this.program) {
      return;
    }

    this.currentIndex += 1;
    if (this.currentIndex >= this.program.instructions.length) {
      this.finishProgram();
      return;
    }

    const instruction = this.program.instructions[this.currentIndex];
    this.currentInstruction = instruction;
    this.timeRemaining = Math.max(instruction.duration, 0);
    this.applyInstruction(instruction);

    if (this.timeRemaining <= EPSILON) {
      this.advanceInstruction();
    }
  }

  private finishProgram(): void {
    this.program = null;
    this.currentInstruction = null;
    this.currentIndex = -1;
    this.timeRemaining = 0;
    this.resetMovement();
    this.updateStatus('completed');
  }

  private applyInstruction(instruction: BlockInstruction): void {
    switch (instruction.kind) {
      case 'move': {
        const orientation = this.robot.getStateSnapshot().orientation;
        const velocityX = Math.cos(orientation) * instruction.speed;
        const velocityY = Math.sin(orientation) * instruction.speed;
        this.applyLinearVelocity(velocityX, velocityY);
        this.applyAngularVelocity(0);
        break;
      }
      case 'turn': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(instruction.angularVelocity);
        break;
      }
      case 'wait':
      default: {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
      }
    }
  }

  private resetMovement(): void {
    this.applyLinearVelocity(0, 0);
    this.applyAngularVelocity(0);
  }

  private applyLinearVelocity(x: number, y: number): void {
    if (!this.robot.moduleStack.getModule(MOVEMENT_MODULE_ID)) {
      return;
    }
    this.robot.invokeAction(MOVEMENT_MODULE_ID, 'setLinearVelocity', { x, y });
  }

  private applyAngularVelocity(value: number): void {
    if (!this.robot.moduleStack.getModule(MOVEMENT_MODULE_ID)) {
      return;
    }
    this.robot.invokeAction(MOVEMENT_MODULE_ID, 'setAngularVelocity', { value });
  }

  private updateStatus(status: ProgramRunnerStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.statusListener?.(status);
  }
}
