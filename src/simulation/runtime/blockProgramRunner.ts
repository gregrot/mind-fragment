import type { MechanismChassis } from '../mechanism';
import type { ValuesSnapshot } from '../mechanism/moduleBus';
import type { Vector2 } from '../mechanism/mechanismState';
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
  UseItemInstruction,
} from './blockProgram';
import { SimpleNavigator } from '../mechanism/modules/navigator';
import { DEFAULT_STORAGE_BOX_ID } from '../storage/storageBox';

export type ProgramRunnerStatus = 'idle' | 'running' | 'completed' | 'error';

const MOVEMENT_MODULE_ID = 'core.movement';
const SCANNER_MODULE_ID = 'sensor.survey';
const MANIPULATOR_MODULE_ID = 'arm.manipulator';
const STATUS_MODULE_ID = 'status.signal';
const USE_ITEM_SWING_INTERVAL = 1;
const USE_ITEM_SWING_COUNT = 3;
const EPSILON = 1e-5;

interface ScanMemoryHit {
  id: string | null;
  type: string;
  quantity: number;
  distance: number;
  position: Vector2 | null;
}

interface ScanMemory {
  filter: string | null;
  hits: ScanMemoryHit[];
}

interface UseItemRuntimeState {
  slotIndex: number;
  nodeId: string;
  target: Vector2;
  swingsRemaining: number;
  cooldown: number;
}

type StoreStorageInstruction = Extract<BlockInstruction, { kind: 'store-storage' }>;
type WithdrawStorageInstruction = Extract<BlockInstruction, { kind: 'withdraw-storage' }>;

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
  private readonly mechanism: MechanismChassis;
  private readonly navigator = new SimpleNavigator();
  private program: CompiledProgram | null = null;
  private currentInstruction: BlockInstruction | null = null;
  private timeRemaining = 0;
  private status: ProgramRunnerStatus = 'idle';
  private statusListener: ((status: ProgramRunnerStatus) => void) | null = null;
  private scanMemory: ScanMemory | null = null;
  private activeUseItem: UseItemRuntimeState | null = null;
  private frames: ExecutionFrame[] = [];
  private activeProgram: CompiledProgram | null = null;
  private debugFrames: ProgramDebugFrame[] = [];
  private debugStateListener: ((state: ProgramDebugState) => void) | null = null;

  constructor(mechanism: MechanismChassis, onStatusChange?: (status: ProgramRunnerStatus) => void) {
    this.mechanism = mechanism;
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

  setDebugStateListener(listener: ((state: ProgramDebugState) => void) | null): void {
    this.debugStateListener = listener;
    if (listener) {
      listener(this.getDebugState());
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
    this.activeUseItem = null;
    this.frames = [];
    this.debugFrames = [];
    this.resetMovement();
    this.notifyDebugState();

    if (!program.instructions || program.instructions.length === 0) {
      this.updateStatus('completed');
      this.notifyDebugState();
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
    this.activeUseItem = null;
    this.frames = [];
    this.debugFrames = [];
    this.resetMovement();
    this.updateStatus('idle');
    this.notifyDebugState();
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
      if (this.currentInstruction?.kind === 'use-item') {
        this.tickUseItemInstruction(delta);
      }
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
    this.activeUseItem = null;

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
    this.activeUseItem = null;
    this.frames = [];
    this.debugFrames = [];
    this.updateStatus('completed');
    this.notifyDebugState();
  }

  private applyInstruction(instruction: BlockInstruction, telemetry: ValuesSnapshot): void {
    switch (instruction.kind) {
      case 'move': {
        const speedLabel = instruction.speed.literal?.label ?? 'Move → speed';
        const speed = this.evaluateNumberBinding(instruction.speed, speedLabel, telemetry);
        const orientation = this.mechanism.getStateSnapshot().orientation;
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
      case 'use-item': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
        this.executeUseItemInstruction(instruction, telemetry);
        break;
      }
      case 'store-storage': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
        this.executeStoreStorage(instruction, telemetry);
        break;
      }
      case 'withdraw-storage': {
        this.applyLinearVelocity(0, 0);
        this.applyAngularVelocity(0);
        this.executeWithdrawStorage(instruction, telemetry);
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

    const state = this.mechanism.getStateSnapshot();
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
    const hit = this.selectScanHitMetadata(requestedIndex);
    if (!hit) {
      return null;
    }

    const resolved = this.resolveScanHitTarget(hit);
    if (resolved.position) {
      return { x: resolved.position.x, y: resolved.position.y } satisfies Vector2;
    }

    return null;
  }

  private resetMovement(): void {
    this.applyLinearVelocity(0, 0);
    this.applyAngularVelocity(0);
  }

  private applyLinearVelocity(x: number, y: number): void {
    if (!this.mechanism.moduleStack.getModule(MOVEMENT_MODULE_ID)) {
      return;
    }
    this.mechanism.invokeAction(MOVEMENT_MODULE_ID, 'setLinearVelocity', { x, y });
  }

  private applyAngularVelocity(value: number): void {
    if (!this.mechanism.moduleStack.getModule(MOVEMENT_MODULE_ID)) {
      return;
    }
    this.mechanism.invokeAction(MOVEMENT_MODULE_ID, 'setAngularVelocity', { value });
  }

  private executeScan(filter: string | null): void {
    if (!this.mechanism.moduleStack.getModule(SCANNER_MODULE_ID)) {
      this.scanMemory = null;
      return;
    }

    const payload = filter ? { resourceType: filter } : {};
    const result = this.mechanism.invokeAction(SCANNER_MODULE_ID, 'scan', payload);
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
            const rawId = (hit as { id?: unknown }).id;
            const id =
              typeof rawId === 'string' && rawId.trim().length > 0 ? rawId.trim() : null;
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
          .filter((hit) => hit.id !== null || hit.position !== null)
      : [];

    this.scanMemory = {
      filter: typeof typed.filter === 'string' ? typed.filter : null,
      hits,
    };
  }

  private executeGather(): void {
    if (!this.mechanism.moduleStack.getModule(MANIPULATOR_MODULE_ID)) {
      return;
    }

    const nodeId = this.resolveGatherTarget();
    if (!nodeId) {
      return;
    }

    const result = this.mechanism.invokeAction(MANIPULATOR_MODULE_ID, 'gatherResource', { nodeId });
    this.updateScanMemoryAfterGather(result);
  }

  private executeUseItemInstruction(instruction: UseItemInstruction, telemetry: ValuesSnapshot): void {
    this.activeUseItem = null;

    if (!this.mechanism.moduleStack.getModule(MANIPULATOR_MODULE_ID)) {
      this.timeRemaining = Math.min(this.timeRemaining, EPSILON);
      return;
    }

    const slotLabel = instruction.slot.index.literal?.label ?? 'Use Tool Slot → slotIndex';
    const requestedSlot = this.evaluateNumberBinding(instruction.slot.index, slotLabel, telemetry);
    const normalisedSlot = Number.isFinite(requestedSlot) ? Math.max(1, Math.floor(requestedSlot)) : 1;
    const slotIndex = normalisedSlot - 1;

    const target = this.resolveUseItemTarget(instruction, telemetry);
    if (!target) {
      this.warn('Use Tool Slot could not determine a valid target; skipping instruction.');
      this.timeRemaining = Math.min(this.timeRemaining, EPSILON);
      return;
    }

    const runtimeState: UseItemRuntimeState = {
      slotIndex,
      nodeId: target.nodeId,
      target: target.target,
      swingsRemaining: USE_ITEM_SWING_COUNT,
      cooldown: 0,
    } satisfies UseItemRuntimeState;

    this.activeUseItem = runtimeState;
    this.performInitialUseItemSwing(runtimeState);
  }

  private performInitialUseItemSwing(state: UseItemRuntimeState): void {
    if (!this.activeUseItem || state.swingsRemaining <= 0) {
      this.activeUseItem = null;
      this.timeRemaining = Math.min(this.timeRemaining, EPSILON);
      return;
    }

    const result = this.performUseItemSwing(state);
    if (result === 'halt') {
      this.activeUseItem = null;
      this.timeRemaining = Math.min(this.timeRemaining, EPSILON);
      return;
    }

    state.swingsRemaining -= 1;

    if (result === 'depleted' || state.swingsRemaining <= 0) {
      this.activeUseItem = null;
      this.timeRemaining = Math.min(this.timeRemaining, EPSILON);
      return;
    }

    state.cooldown = USE_ITEM_SWING_INTERVAL;
  }

  private tickUseItemInstruction(delta: number): void {
    if (!this.activeUseItem) {
      return;
    }

    const state = this.activeUseItem;

    if (delta <= 0) {
      if (state.swingsRemaining <= 0) {
        this.activeUseItem = null;
        this.timeRemaining = Math.min(this.timeRemaining, EPSILON);
      }
      return;
    }

    let remaining = delta;

    while (remaining > EPSILON && this.activeUseItem && state.swingsRemaining > 0) {
      if (state.cooldown > EPSILON) {
        const step = Math.min(state.cooldown, remaining);
        state.cooldown -= step;
        remaining -= step;
        if (remaining <= EPSILON) {
          break;
        }
      }

      if (state.cooldown > EPSILON || state.swingsRemaining <= 0) {
        break;
      }

      const result = this.performUseItemSwing(state);
      if (result === 'halt') {
        this.activeUseItem = null;
        this.timeRemaining = Math.min(this.timeRemaining, EPSILON);
        return;
      }

      state.swingsRemaining -= 1;

      if (result === 'depleted' || state.swingsRemaining <= 0) {
        this.activeUseItem = null;
        this.timeRemaining = Math.min(this.timeRemaining, EPSILON);
        return;
      }

      state.cooldown = USE_ITEM_SWING_INTERVAL;
    }
  }

  private performUseItemSwing(state: UseItemRuntimeState): 'continue' | 'halt' | 'depleted' {
    const payload = {
      slot: state.slotIndex,
      nodeId: state.nodeId,
      target: { x: state.target.x, y: state.target.y },
    };

    const result = this.mechanism.invokeAction(MANIPULATOR_MODULE_ID, 'useInventoryItem', payload);
    this.updateScanMemoryAfterGather(result);

    if (!result || typeof result !== 'object') {
      return 'halt';
    }

    const typed = result as {
      status?: unknown;
      nodeId?: unknown;
      target?: unknown;
    };

    const status = typeof typed.status === 'string' ? typed.status : 'unknown';

    if (typeof typed.nodeId === 'string' && typed.nodeId.trim().length > 0) {
      state.nodeId = typed.nodeId;
    }

    if (typed.target && typeof typed.target === 'object') {
      const nextTarget = typed.target as { x?: unknown; y?: unknown };
      if (typeof nextTarget.x === 'number' && Number.isFinite(nextTarget.x)) {
        state.target.x = nextTarget.x;
      }
      if (typeof nextTarget.y === 'number' && Number.isFinite(nextTarget.y)) {
        state.target.y = nextTarget.y;
      }
    }

    switch (status) {
      case 'ok':
        return 'continue';
      case 'depleted':
        return 'depleted';
      case 'empty-slot':
      case 'invalid-slot':
      case 'invalid-item':
      case 'invalid-target':
      case 'not-found':
      case 'missing-systems':
      case 'inactive':
        return 'halt';
      default:
        return 'continue';
    }
  }

  private executeStoreStorage(instruction: StoreStorageInstruction, telemetry: ValuesSnapshot): void {
    if (!this.mechanism.moduleStack.getModule(MANIPULATOR_MODULE_ID)) {
      return;
    }

    const amountLabel = instruction.amount.literal?.label ?? 'Store Storage → amount';
    const requestedAmount = Math.max(
      0,
      this.evaluateNumberBinding(instruction.amount, amountLabel, telemetry),
    );

    const payload: Record<string, unknown> = {};
    const boxId = instruction.boxId.value.trim();
    if (boxId.length > 0) {
      payload.boxId = boxId;
    }
    const resourceId = instruction.resource.value.trim();
    if (resourceId.length > 0) {
      payload.resource = resourceId;
    }
    if (requestedAmount > 0) {
      payload.amount = requestedAmount;
    }

    this.mechanism.invokeAction(MANIPULATOR_MODULE_ID, 'storeInStorageBox', payload);
  }

  private executeWithdrawStorage(instruction: WithdrawStorageInstruction, telemetry: ValuesSnapshot): void {
    if (!this.mechanism.moduleStack.getModule(MANIPULATOR_MODULE_ID)) {
      return;
    }

    const amountLabel = instruction.amount.literal?.label ?? 'Withdraw Storage → amount';
    const requestedAmount = Math.max(
      0,
      this.evaluateNumberBinding(instruction.amount, amountLabel, telemetry),
    );

    const payload: Record<string, unknown> = {};
    const boxId = instruction.boxId.value.trim();
    if (boxId.length > 0) {
      payload.boxId = boxId;
    }
    const resourceId = instruction.resource.value.trim();
    if (resourceId.length > 0) {
      payload.resource = resourceId;
    }
    if (requestedAmount > 0) {
      payload.amount = requestedAmount;
    }

    this.mechanism.invokeAction(MANIPULATOR_MODULE_ID, 'withdrawFromStorageBox', payload);
  }

  private executeDeposit(): void {
    if (!this.mechanism.moduleStack.getModule(MANIPULATOR_MODULE_ID)) {
      return;
    }

    this.mechanism.invokeAction(MANIPULATOR_MODULE_ID, 'storeInStorageBox', {
      boxId: DEFAULT_STORAGE_BOX_ID,
    });
  }

  private resolveUseItemTarget(
    instruction: UseItemInstruction,
    telemetry: ValuesSnapshot,
  ): { nodeId: string; target: Vector2 } | null {
    const useScanLabel = instruction.target.useScanHit.literal?.label ?? 'Use Tool Slot → useScanHit';
    const useScan = this.evaluateBooleanBinding(instruction.target.useScanHit, useScanLabel, telemetry);

    if (useScan) {
      const indexLabel = instruction.target.scanHitIndex.literal?.label ?? 'Use Tool Slot → scanHitIndex';
      const requestedIndex = this.evaluateNumberBinding(
        instruction.target.scanHitIndex,
        indexLabel,
        telemetry,
      );
      const hit = this.selectScanHitMetadata(requestedIndex);
      if (hit) {
        const resolved = this.resolveScanHitTarget(hit);
        if (resolved.node && resolved.position) {
          return { nodeId: resolved.node.id, target: resolved.position };
        }
      }
    }

    const targetXLabel = instruction.target.literalPosition.x.literal?.label ?? 'Use Tool Slot → targetX';
    const targetYLabel = instruction.target.literalPosition.y.literal?.label ?? 'Use Tool Slot → targetY';
    const literalX = this.evaluateNumberBinding(instruction.target.literalPosition.x, targetXLabel, telemetry);
    const literalY = this.evaluateNumberBinding(instruction.target.literalPosition.y, targetYLabel, telemetry);

    if (Number.isFinite(literalX) && Number.isFinite(literalY)) {
      const manualPosition = { x: literalX, y: literalY } satisfies Vector2;
      const nearbyNode = this.findClosestNodeToPosition(manualPosition);
      if (nearbyNode) {
        return { nodeId: nearbyNode.id, target: manualPosition };
      }
    }

    const fallbackNodeId = this.resolveGatherTarget();
    if (!fallbackNodeId) {
      return null;
    }

    const fallbackNode = this.mechanism.resourceField
      .list()
      .find((candidate) => candidate.id === fallbackNodeId);

    if (fallbackNode) {
      return {
        nodeId: fallbackNodeId,
        target: { x: fallbackNode.position.x, y: fallbackNode.position.y },
      } satisfies { nodeId: string; target: Vector2 };
    }

    const state = this.mechanism.getStateSnapshot();
    return {
      nodeId: fallbackNodeId,
      target: { x: state.position.x, y: state.position.y },
    } satisfies { nodeId: string; target: Vector2 };
  }

  private resolveGatherTarget(): string | null {
    const nodes = this.mechanism.resourceField
      .list()
      .filter((node) => node.quantity > 0);
    if (nodes.length === 0) {
      return null;
    }

    const scannedHits = this.scanMemory?.hits ?? [];
    if (scannedHits.length > 0) {
      for (const hit of scannedHits) {
        if (hit.quantity <= 0) {
          continue;
        }
        if (hit.id) {
          const matchingNode = nodes.find((node) => node.id === hit.id);
          if (matchingNode) {
            return matchingNode.id;
          }
        }
      }

      let closestFromPosition: { node: ResourceNode; distance: number } | null = null;
      for (const hit of scannedHits) {
        if (hit.quantity <= 0 || !hit.position) {
          continue;
        }
        for (const node of nodes) {
          const distance = Math.hypot(
            node.position.x - hit.position.x,
            node.position.y - hit.position.y,
          );
          if (!closestFromPosition || distance < closestFromPosition.distance) {
            closestFromPosition = { node, distance };
          }
        }
      }

      if (closestFromPosition) {
        return closestFromPosition.node.id;
      }
    }

    const state = this.mechanism.getStateSnapshot();
    let closestToMechanism: ResourceNode | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const node of nodes) {
      const dx = node.position.x - state.position.x;
      const dy = node.position.y - state.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        closestToMechanism = node;
      }
    }

    return closestToMechanism?.id ?? null;
  }

  private selectScanHitMetadata(requestedIndex: number): ScanMemoryHit | null {
    if (!this.scanMemory || this.scanMemory.hits.length === 0) {
      return null;
    }

    const safeIndex = Number.isFinite(requestedIndex) ? Math.max(1, Math.floor(requestedIndex)) : 1;
    return this.scanMemory.hits[safeIndex - 1] ?? null;
  }

  private resolveScanHitTarget(
    hit: ScanMemoryHit,
  ): { node: ResourceNode | null; position: Vector2 | null } {
    let node: ResourceNode | null = null;
    if (hit.id) {
      node = this.mechanism.resourceField
        .list()
        .find((candidate) => candidate.id === hit.id)
        ?? null;
    }

    if (!node && hit.position) {
      node = this.findClosestNodeToPosition(hit.position);
    }

    const position: Vector2 | null = hit.position
      ? { x: hit.position.x, y: hit.position.y }
      : node
        ? { x: node.position.x, y: node.position.y }
        : null;

    return { node, position };
  }

  private findClosestNodeToPosition(position: Vector2): ResourceNode | null {
    const nodes = this.mechanism.resourceField
      .list()
      .filter((node) => node.quantity > 0);

    if (nodes.length === 0) {
      return null;
    }

    let closest: ResourceNode | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const node of nodes) {
      const distance = Math.hypot(node.position.x - position.x, node.position.y - position.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = node;
      }
    }

    return closest;
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
    if (!this.mechanism.moduleStack.getModule(STATUS_MODULE_ID)) {
      return;
    }
    this.mechanism.invokeAction(STATUS_MODULE_ID, 'toggleStatus', {});
  }

  private applyStatusSet(value: boolean): void {
    if (!this.mechanism.moduleStack.getModule(STATUS_MODULE_ID)) {
      return;
    }
    this.mechanism.invokeAction(STATUS_MODULE_ID, 'setStatus', { value });
  }

  private getTelemetryValues(): ValuesSnapshot {
    return this.mechanism.getTelemetrySnapshot().values ?? {};
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

  private notifyDebugState(): void {
    if (this.debugStateListener) {
      this.debugStateListener(this.getDebugState());
    }
  }

  private updateDebugFrames(): void {
    if (this.frames.length === 0) {
      this.debugFrames = [];
      this.notifyDebugState();
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
    this.notifyDebugState();
  }
}
