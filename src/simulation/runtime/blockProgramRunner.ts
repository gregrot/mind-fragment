import type { RobotChassis } from '../robot';
import type { ValuesSnapshot } from '../robot/moduleBus';
import type { Vector2 } from '../robot/robotState';
import type { ResourceNode } from '../resources/resourceField';
import type {
  BlockInstruction,
  BooleanExpression,
  BooleanParameterBinding,
  CompiledProgram,
  MoveToInstruction,
  NumberExpression,
  NumberParameterBinding,
  SignalDescriptor,
} from './blockProgram';
import { SimpleNavigator } from '../robot/modules/navigator';

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
  position: Vector2 | null;
}

interface ScanMemory {
  filter: string | null;
  hits: ScanMemoryHit[];
}

type ExecutionFrameKind = 'sequence' | 'loop-forever' | 'loop-counted';

interface SequenceFrame {
  kind: 'sequence';
  instructions: BlockInstruction[];
  index: number;
}

interface LoopForeverFrame {
  kind: 'loop-forever';
  instructions: BlockInstruction[];
  index: number;
}

interface LoopCountedFrame {
  kind: 'loop-counted';
  instructions: BlockInstruction[];
  index: number;
  remaining: number;
}

type ExecutionFrame = SequenceFrame | LoopForeverFrame | LoopCountedFrame;

export interface ProgramDebugFrame {
  kind: 'sequence' | 'loop';
  index: number;
  length: number;
}

export interface ProgramDebugState {
  status: ProgramRunnerStatus;
  program: CompiledProgram | null;
  currentInstruction: BlockInstruction | null;
  timeRemaining: number;
  frames: ProgramDebugFrame[];
}

export class BlockProgramRunner {
  private readonly robot: RobotChassis;
  private readonly navigator = new SimpleNavigator();
  private program: CompiledProgram | null = null;
  private currentInstruction: BlockInstruction | null = null;
  private timeRemaining = 0;
  private status: ProgramRunnerStatus = 'idle';
  private statusListener: ((status: ProgramRunnerStatus) => void) | null = null;
  private scanMemory: ScanMemory | null = null;
  private frames: ExecutionFrame[] = [];
  private activeProgram: CompiledProgram | null = null;
  private debugFrames: ProgramDebugFrame[] = [];

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
    this.activeProgram = program;
    this.currentInstruction = null;
    this.timeRemaining = 0;
    this.scanMemory = null;
    this.frames = [];
    this.debugFrames = [];
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
    this.activeProgram = null;
    this.currentInstruction = null;
    this.timeRemaining = 0;
    this.scanMemory = null;
    this.frames = [];
    this.debugFrames = [];
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
      if (this.currentInstruction?.kind === 'move-to') {
        const telemetryForMaintenance = this.getTelemetryValues();
        this.executeMoveToInstruction(this.currentInstruction, telemetryForMaintenance);
      }

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
      this.updateDebugFrames();
      return;
    }

    this.currentInstruction = null;

    while (this.frames.length > 0) {
      const frame = this.frames[this.frames.length - 1];

      if (frame.kind === 'loop-counted' && frame.instructions.length === 0) {
        this.frames.pop();
        continue;
      }

      if (frame.kind === 'loop-counted' && frame.index >= frame.instructions.length) {
        frame.remaining -= 1;
        if (frame.remaining > 0) {
          frame.index = 0;
          continue;
        }
        this.frames.pop();
        continue;
      }

      if (frame.kind === 'loop-forever' && frame.instructions.length === 0) {
        this.frames.pop();
        continue;
      }

      if (frame.kind === 'loop-forever' && frame.index >= frame.instructions.length) {
        frame.index = 0;
        continue;
      }

      if (frame.index >= frame.instructions.length) {
        this.frames.pop();
        continue;
      }

      const instruction = frame.instructions[frame.index];

      if (instruction.kind === 'loop') {
        frame.index += 1;
        if (instruction.instructions.length === 0) {
          continue;
        }

        if (instruction.mode === 'forever') {
          this.frames.push({ kind: 'loop-forever', instructions: instruction.instructions, index: 0 });
        } else {
          const telemetry = this.getTelemetryValues();
          const label = instruction.iterations.literal?.label ?? 'Repeat → count';
          const iterations = Math.max(
            0,
            Math.floor(this.evaluateNumberBinding(instruction.iterations, label, telemetry)),
          );
          if (iterations <= 0) {
            continue;
          }
          this.frames.push({
            kind: 'loop-counted',
            instructions: instruction.instructions,
            index: 0,
            remaining: iterations,
          });
        }
        continue;
      }

      if (instruction.kind === 'branch') {
        frame.index += 1;
        const telemetry = this.getTelemetryValues();
        const label = instruction.condition.literal?.label ?? 'If → condition';
        const condition = this.evaluateBooleanBinding(instruction.condition, label, telemetry);
        const branch = condition ? instruction.whenTrue : instruction.whenFalse;
        if (branch.length > 0) {
          this.frames.push({ kind: 'sequence', instructions: branch, index: 0 });
        }
        continue;
      }

      const telemetry = this.getTelemetryValues();
      const durationLabel = instruction.duration.literal?.label ?? `${instruction.kind} → duration`;
      const duration = Math.max(0, this.evaluateNumberBinding(instruction.duration, durationLabel, telemetry));

      this.currentInstruction = instruction;
      this.timeRemaining = duration;
      frame.index += 1;
      this.applyInstruction(instruction, telemetry);

      if (this.timeRemaining <= EPSILON) {
        this.currentInstruction = null;
        this.updateDebugFrames();
        continue;
      }

      this.updateDebugFrames();
      return;
    }

    this.updateDebugFrames();
    this.finishProgram();
  }

  private finishProgram(): void {
    this.program = null;
    this.currentInstruction = null;
    this.timeRemaining = 0;
    this.resetMovement();
    this.frames = [];
    this.debugFrames = [];
    this.updateStatus('completed');
  }

  private applyInstruction(instruction: BlockInstruction, telemetry: ValuesSnapshot): void {
    switch (instruction.kind) {
      case 'move': {
        const speedLabel = instruction.speed.literal?.label ?? 'Move → speed';
        const speed = this.evaluateNumberBinding(instruction.speed, speedLabel, telemetry);
        const orientation = this.robot.getStateSnapshot().orientation;
        const velocityX = Math.cos(orientation) * speed;
        const velocityY = Math.sin(orientation) * speed;
        this.applyLinearVelocity(velocityX, velocityY);
        this.applyAngularVelocity(0);
        break;
      }
      case 'move-to': {
        this.executeMoveToInstruction(instruction, telemetry);
        break;
      }
      case 'turn': {
        this.applyLinearVelocity(0, 0);
        const rateLabel = instruction.angularVelocity.literal?.label ?? 'Turn → rate';
        const angularVelocity = this.evaluateNumberBinding(
          instruction.angularVelocity,
          rateLabel,
          telemetry,
        );
        this.applyAngularVelocity(angularVelocity);
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
      case 'deposit': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
        this.executeDeposit();
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
        const valueLabel = instruction.value.literal?.label ?? 'Set Status → value';
        const value = this.evaluateBooleanBinding(instruction.value, valueLabel, telemetry);
        this.applyStatusSet(value);
        break;
      }
      case 'loop': {
        // Loops are handled via the execution stack when selecting instructions.
        break;
      }
      case 'branch': {
        break;
      }
      case 'wait':
      default: {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
      }
    }
  }

  private executeMoveToInstruction(instruction: MoveToInstruction, telemetry: ValuesSnapshot): void {
    const speedLabel = instruction.speed.literal?.label ?? 'Move To → speed';
    const requestedSpeed = Math.max(
      0,
      this.evaluateNumberBinding(instruction.speed, speedLabel, telemetry),
    );

    const target = this.resolveMoveToTarget(instruction, telemetry);
    if (!target) {
      this.applyLinearVelocity(0, 0);
      this.applyAngularVelocity(0);
      return;
    }

    const state = this.robot.getStateSnapshot();
    const command = this.navigator.steerTowards(state, target, requestedSpeed);
    this.applyAngularVelocity(command.angularVelocity);
    this.applyLinearVelocity(command.linearVelocity.x, command.linearVelocity.y);
  }

  private resolveMoveToTarget(instruction: MoveToInstruction, telemetry: ValuesSnapshot): Vector2 | null {
    const useScanLabel = instruction.target.useScanHit.literal?.label ?? 'Move To → use scan hit';
    const useScan = this.evaluateBooleanBinding(
      instruction.target.useScanHit,
      useScanLabel,
      telemetry,
    );

    if (useScan) {
      const indexLabel = instruction.target.scanHitIndex.literal?.label ?? 'Move To → scan hit index';
      const hitIndex = this.evaluateNumberBinding(
        instruction.target.scanHitIndex,
        indexLabel,
        telemetry,
      );
      const scanPosition = this.selectScanTarget(hitIndex);
      if (scanPosition) {
        return scanPosition;
      }
    }

    const literalXLabel = instruction.target.literalPosition.x.literal?.label ?? 'Move To → target X';
    const literalYLabel = instruction.target.literalPosition.y.literal?.label ?? 'Move To → target Y';
    const literalX = this.evaluateNumberBinding(
      instruction.target.literalPosition.x,
      literalXLabel,
      telemetry,
    );
    const literalY = this.evaluateNumberBinding(
      instruction.target.literalPosition.y,
      literalYLabel,
      telemetry,
    );

    if (!Number.isFinite(literalX) || !Number.isFinite(literalY)) {
      return null;
    }

    return { x: literalX, y: literalY } satisfies Vector2;
  }

  private selectScanTarget(requestedIndex: number): Vector2 | null {
    if (!this.scanMemory || this.scanMemory.hits.length === 0) {
      return null;
    }

    const safeIndex = Number.isFinite(requestedIndex)
      ? Math.max(1, Math.floor(requestedIndex))
      : 1;
    const hit = this.scanMemory.hits[safeIndex - 1] ?? null;
    if (!hit) {
      return null;
    }

    if (hit.position) {
      return { x: hit.position.x, y: hit.position.y } satisfies Vector2;
    }

    const node = this.robot.resourceField.list().find((candidate) => candidate.id === hit.id);
    if (!node) {
      return null;
    }

    return { x: node.position.x, y: node.position.y } satisfies Vector2;
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
            const positionRaw = (hit as { position?: unknown }).position;
            const quantity =
              typeof quantityRaw === 'number' && Number.isFinite(quantityRaw)
                ? Math.max(quantityRaw, 0)
                : 0;
            const distance =
              typeof distanceRaw === 'number' && Number.isFinite(distanceRaw)
                ? Math.max(distanceRaw, 0)
                : Number.POSITIVE_INFINITY;
            let position: Vector2 | null = null;
            if (
              positionRaw &&
              typeof positionRaw === 'object' &&
              typeof (positionRaw as { x?: unknown }).x === 'number' &&
              Number.isFinite((positionRaw as { x: number }).x) &&
              typeof (positionRaw as { y?: unknown }).y === 'number' &&
              Number.isFinite((positionRaw as { y: number }).y)
            ) {
              position = {
                x: (positionRaw as { x: number }).x,
                y: (positionRaw as { y: number }).y,
              } satisfies Vector2;
            }
            return { id, type, quantity, distance, position } satisfies ScanMemoryHit;
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

  private executeDeposit(): void {
    if (!this.robot.moduleStack.getModule(MANIPULATOR_MODULE_ID)) {
      return;
    }

    this.robot.invokeAction(MANIPULATOR_MODULE_ID, 'dropResource', {});
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

  private getTelemetryValues(): ValuesSnapshot {
    return this.robot.getTelemetrySnapshot().values ?? {};
  }

  private evaluateNumberBinding(
    binding: NumberParameterBinding,
    label: string,
    telemetry: ValuesSnapshot,
  ): number {
    if (binding.expression) {
      const evaluated = this.evaluateNumberExpression(binding.expression, telemetry, label);
      if (Number.isFinite(evaluated)) {
        return evaluated;
      }
    }

    const literalValue = binding.literal?.value;
    if (Number.isFinite(literalValue)) {
      return literalValue as number;
    }

    this.warn(`${label} resolved to an invalid number; using 0.`);
    return 0;
  }

  private evaluateBooleanBinding(
    binding: BooleanParameterBinding,
    label: string,
    telemetry: ValuesSnapshot,
  ): boolean {
    if (binding.expression) {
      return this.evaluateBooleanExpression(binding.expression, telemetry, label);
    }

    const literalValue = binding.literal?.value;
    if (typeof literalValue === 'boolean') {
      return literalValue;
    }

    this.warn(`${label} resolved to an invalid condition; using false.`);
    return false;
  }

  private evaluateNumberExpression(
    expression: NumberExpression,
    telemetry: ValuesSnapshot,
    label: string,
  ): number {
    switch (expression.kind) {
      case 'literal':
        return expression.value;
      case 'signal': {
        const value = this.readSignalValue(expression.signal, telemetry);
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
        if (expression.fallback) {
          this.warn(
            `${label} could not read ${this.describeSignal(expression.signal)}; using ${expression.fallback.value}.`,
          );
          return expression.fallback.value;
        }
        this.warn(`${label} could not read ${this.describeSignal(expression.signal)}; using 0.`);
        return 0;
      }
      case 'operator': {
        switch (expression.operator) {
          case 'add': {
            const operandLabel = expression.label ?? label;
            return expression.inputs.reduce((total, input) => {
              const value = this.evaluateNumberExpression(input as NumberExpression, telemetry, operandLabel);
              return total + (Number.isFinite(value) ? value : 0);
            }, 0);
          }
          default:
            this.warn(`${label} operator ${expression.operator} is not supported for numbers; using 0.`);
            return 0;
        }
      }
      default:
        return 0;
    }
  }

  private evaluateBooleanExpression(
    expression: BooleanExpression,
    telemetry: ValuesSnapshot,
    label: string,
  ): boolean {
    switch (expression.kind) {
      case 'literal':
        return expression.value;
      case 'signal': {
        const value = this.readSignalValue(expression.signal, telemetry);
        if (typeof value === 'boolean') {
          return value;
        }
        if (expression.fallback) {
          this.warn(
            `${label} could not read ${this.describeSignal(expression.signal)}; using ${expression.fallback.value ? 'true' : 'false'}.`,
          );
          return expression.fallback.value;
        }
        this.warn(`${label} could not read ${this.describeSignal(expression.signal)}; using false.`);
        return false;
      }
      case 'operator': {
        switch (expression.operator) {
          case 'and': {
            const operandLabel = expression.label ?? label;
            return expression.inputs.every((input) =>
              this.evaluateBooleanExpression(input as BooleanExpression, telemetry, operandLabel),
            );
          }
          case 'greater-than': {
            if (expression.inputs.length < 2) {
              this.warn(`${label} is missing comparison inputs; using false.`);
              return false;
            }
            const operandLabel = expression.label ?? label;
            const firstValue = this.evaluateNumberExpression(
              expression.inputs[0] as NumberExpression,
              telemetry,
              operandLabel,
            );
            const secondValue = this.evaluateNumberExpression(
              expression.inputs[1] as NumberExpression,
              telemetry,
              operandLabel,
            );
            return firstValue > secondValue;
          }
          default:
            this.warn(`${label} operator ${expression.operator} is not supported for booleans; using false.`);
            return false;
        }
      }
      default:
        return false;
    }
  }

  private readSignalValue(descriptor: SignalDescriptor, telemetry: ValuesSnapshot): unknown {
    if (!descriptor.moduleId || !descriptor.signalId) {
      return undefined;
    }
    const moduleValues = telemetry[descriptor.moduleId];
    if (!moduleValues) {
      return undefined;
    }
    return moduleValues[descriptor.signalId]?.value;
  }

  private describeSignal(descriptor: SignalDescriptor): string {
    const readable = descriptor.label ?? descriptor.id;
    const identifier = descriptor.moduleId && descriptor.signalId
      ? `${descriptor.moduleId}.${descriptor.signalId}`
      : descriptor.id;
    if (identifier && identifier !== readable) {
      return `${readable} (${identifier})`;
    }
    return readable;
  }

  private warn(message: string): void {
    // eslint-disable-next-line no-console
    console.warn(`[BlockProgramRunner] ${message}`);
  }

  private updateStatus(status: ProgramRunnerStatus): void {
    if (this.status === status) {
      return;
    }
    this.status = status;
    this.statusListener?.(status);
  }

  getDebugState(): ProgramDebugState {
    return {
      status: this.status,
      program: this.activeProgram,
      currentInstruction: this.currentInstruction,
      timeRemaining: this.timeRemaining,
      frames: this.debugFrames.map((frame) => ({ ...frame })),
    } satisfies ProgramDebugState;
  }

  private updateDebugFrames(): void {
    if (this.frames.length === 0) {
      this.debugFrames = [];
      return;
    }

    const nextFrames: ProgramDebugFrame[] = this.frames.map((frame, index, frames) => {
      const isActiveFrame = index === frames.length - 1 && this.currentInstruction !== null;
      const length = frame.instructions.length;
      const rawIndex = isActiveFrame ? frame.index - 1 : frame.index;
      let adjustedIndex = rawIndex;

      if (length <= 0) {
        adjustedIndex = 0;
      } else if (isActiveFrame) {
        adjustedIndex = Math.min(Math.max(rawIndex, 0), length - 1);
      } else {
        adjustedIndex = Math.min(Math.max(rawIndex, 0), length);
      }

      const kind: ProgramDebugFrame['kind'] = frame.kind === 'sequence' ? 'sequence' : 'loop';
      return {
        kind,
        index: adjustedIndex,
        length,
      } satisfies ProgramDebugFrame;
    });

    this.debugFrames = nextFrames;
  }
}
