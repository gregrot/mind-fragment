import type { RobotChassis } from '../robot';
import type { ResourceNode } from '../resources/resourceField';
import type { BlockInstruction, CompiledProgram } from './blockProgram';

export type ProgramRunnerStatus = 'idle' | 'running' | 'completed';

const MOVEMENT_MODULE_ID = 'core.movement';
const SCANNER_MODULE_ID = 'sensor.survey';
const MANIPULATOR_MODULE_ID = 'arm.manipulator';
const STATUS_MODULE_ID = 'status.signal';
const EPSILON = 1e-5;

interface ScanMemoryHit {
  id: string;
  type: string;
  quantity: number;
  distance: number;
}

interface ScanMemory {
  filter: string | null;
  hits: ScanMemoryHit[];
}

type ExecutionFrameKind = 'sequence' | 'loop';

interface ExecutionFrame {
  kind: ExecutionFrameKind;
  instructions: BlockInstruction[];
  index: number;
}

export class BlockProgramRunner {
  private readonly robot: RobotChassis;
  private program: CompiledProgram | null = null;
  private currentInstruction: BlockInstruction | null = null;
  private timeRemaining = 0;
  private status: ProgramRunnerStatus = 'idle';
  private statusListener: ((status: ProgramRunnerStatus) => void) | null = null;
  private scanMemory: ScanMemory | null = null;
  private frames: ExecutionFrame[] = [];

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
    this.timeRemaining = 0;
    this.scanMemory = null;
    this.frames = [];
    this.resetMovement();

    if (!program.instructions || program.instructions.length === 0) {
      this.updateStatus('completed');
      return;
    }

    this.frames.push({ kind: 'sequence', instructions: program.instructions, index: 0 });
    this.updateStatus('running');
    this.advanceInstruction();
  }

  stop(): void {
    this.program = null;
    this.currentInstruction = null;
    this.timeRemaining = 0;
    this.scanMemory = null;
    this.frames = [];
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

    this.currentInstruction = null;

    while (this.frames.length > 0) {
      const frame = this.frames[this.frames.length - 1];

      if (frame.index >= frame.instructions.length) {
        if (frame.kind === 'loop') {
          if (frame.instructions.length === 0) {
            this.frames.pop();
            continue;
          }
          frame.index = 0;
          continue;
        }

        this.frames.pop();
        continue;
      }

      const instruction = frame.instructions[frame.index];

      if (instruction.kind === 'loop') {
        frame.index += 1;
        if (instruction.instructions.length === 0) {
          continue;
        }
        this.frames.push({ kind: 'loop', instructions: instruction.instructions, index: 0 });
        continue;
      }

      this.currentInstruction = instruction;
      this.timeRemaining = Math.max(instruction.duration, 0);
      frame.index += 1;
      this.applyInstruction(instruction);

      if (this.timeRemaining <= EPSILON) {
        continue;
      }

      return;
    }

    this.finishProgram();
  }

  private finishProgram(): void {
    this.program = null;
    this.currentInstruction = null;
    this.timeRemaining = 0;
    this.resetMovement();
    this.frames = [];
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
      case 'scan': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
        this.executeScan(instruction.filter);
        break;
      }
      case 'gather': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
        this.executeGather();
        break;
      }
      case 'status-toggle': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
        this.applyStatusToggle();
        break;
      }
      case 'status-set': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
        this.applyStatusSet(instruction.value);
        break;
      }
      case 'loop': {
        // Loops are handled via the execution stack when selecting instructions.
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

  private executeScan(filter: string | null): void {
    if (!this.robot.moduleStack.getModule(SCANNER_MODULE_ID)) {
      this.scanMemory = null;
      return;
    }

    const payload = filter ? { resourceType: filter } : {};
    const result = this.robot.invokeAction(SCANNER_MODULE_ID, 'scan', payload);
    this.recordScanResult(result);
  }

  private recordScanResult(result: unknown): void {
    if (!result || typeof result !== 'object') {
      this.scanMemory = null;
      return;
    }

    const typed = result as {
      filter?: string | null;
      resources?: { hits?: Array<Record<string, unknown>> };
    };

    const hits = Array.isArray(typed.resources?.hits)
      ? typed.resources!.hits
          .map((hit) => {
            const id = typeof hit.id === 'string' ? hit.id : '';
            const type = typeof hit.type === 'string' ? hit.type : 'unknown';
            const quantityRaw = (hit as { quantity?: unknown }).quantity;
            const distanceRaw = (hit as { distance?: unknown }).distance;
            const quantity =
              typeof quantityRaw === 'number' && Number.isFinite(quantityRaw)
                ? Math.max(quantityRaw, 0)
                : 0;
            const distance =
              typeof distanceRaw === 'number' && Number.isFinite(distanceRaw)
                ? Math.max(distanceRaw, 0)
                : Number.POSITIVE_INFINITY;
            return { id, type, quantity, distance } satisfies ScanMemoryHit;
          })
          .filter((hit) => hit.id)
      : [];

    this.scanMemory = {
      filter: typeof typed.filter === 'string' ? typed.filter : null,
      hits,
    };
  }

  private executeGather(): void {
    if (!this.robot.moduleStack.getModule(MANIPULATOR_MODULE_ID)) {
      return;
    }

    const nodeId = this.resolveGatherTarget();
    if (!nodeId) {
      return;
    }

    const result = this.robot.invokeAction(MANIPULATOR_MODULE_ID, 'gatherResource', { nodeId });
    this.updateScanMemoryAfterGather(result);
  }

  private resolveGatherTarget(): string | null {
    const scanned = this.scanMemory?.hits.find((hit) => hit.quantity > 0);
    if (scanned) {
      return scanned.id;
    }

    const state = this.robot.getStateSnapshot();
    const nodes = this.robot.resourceField.list();
    let closest: ResourceNode | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const node of nodes) {
      if (node.quantity <= 0) {
        continue;
      }
      const dx = node.position.x - state.position.x;
      const dy = node.position.y - state.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = node;
      }
    }

    return closest?.id ?? null;
  }

  private updateScanMemoryAfterGather(result: unknown): void {
    if (!this.scanMemory || !result || typeof result !== 'object') {
      return;
    }

    const typed = result as { nodeId?: unknown; remaining?: unknown };
    if (typeof typed.nodeId !== 'string') {
      return;
    }

    const remaining =
      typeof typed.remaining === 'number' && Number.isFinite(typed.remaining)
        ? Math.max(typed.remaining, 0)
        : null;

    if (remaining === null) {
      return;
    }

    const nextHits = this.scanMemory.hits
      .map((hit) => (hit.id === typed.nodeId ? { ...hit, quantity: remaining } : hit))
      .filter((hit) => hit.quantity > 0);

    this.scanMemory = {
      ...this.scanMemory,
      hits: nextHits,
    };
  }

  private applyStatusToggle(): void {
    if (!this.robot.moduleStack.getModule(STATUS_MODULE_ID)) {
      return;
    }
    this.robot.invokeAction(STATUS_MODULE_ID, 'toggleStatus', {});
  }

  private applyStatusSet(value: boolean): void {
    if (!this.robot.moduleStack.getModule(STATUS_MODULE_ID)) {
      return;
    }
    this.robot.invokeAction(STATUS_MODULE_ID, 'setStatus', { value });
  }

  private updateStatus(status: ProgramRunnerStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.statusListener?.(status);
  }
}
