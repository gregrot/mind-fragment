import { Application, Container, Graphics, Sprite, Text, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { assetService } from './assetService';
import { RobotChassis } from './robot';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from './robot/modules/moduleLibrary';
import { STATUS_MODULE_ID } from './robot/modules/statusModule';
import type { BlockInstruction, CompiledProgram } from './runtime/blockProgram';
import {
  BlockProgramRunner,
  type ProgramDebugFrame,
  type ProgramDebugState,
  type ProgramRunnerStatus,
} from './runtime/blockProgramRunner';
import type { InventorySnapshot } from './robot/inventory';
import { ResourceLayer } from './resourceLayer';

interface TickPayload {
  deltaMS: number;
}

const STEP_MS = 1000 / 60;
const GRID_EXTENT = 2000;
const GRID_SPACING = 80;
const DEFAULT_ROBOT_ID = 'MF-01';
const DEBUG_PADDING = 8;
const DEBUG_VERTICAL_OFFSET = 72;
const DEBUG_CORNER_RADIUS = 8;
const DEBUG_MAX_WIDTH = 280;
const DEBUG_MIN_WIDTH = 180;
const DEBUG_BACKGROUND_COLOUR = 0x0b1623;

type RobotSelectionListener = (robotId: string | null) => void;

type TelemetrySnapshot = ReturnType<RobotChassis['getTelemetrySnapshot']>;

export class RootScene {
  private readonly app: Application;
  private readonly viewport: Viewport;
  private readonly backgroundLayer: Container;
  private readonly rootLayer: Container;
  private robotCore: RobotChassis | null;
  private robot: Sprite | null;
  private hasPlayerPanned: boolean;
  private accumulator: number;
  private readonly tickHandler: (payload: TickPayload) => void;
  private programRunner: BlockProgramRunner | null;
  private programStatus: ProgramRunnerStatus;
  private readonly programListeners: Set<(status: ProgramRunnerStatus) => void>;
  private readonly selectionListeners: Set<RobotSelectionListener>;
  private selectedRobotId: string | null;
  private statusIndicator: Graphics | null;
  private resourceLayer: ResourceLayer | null;
  private debugOverlay: Container | null;
  private debugBackground: Graphics | null;
  private debugText: Text | null;
  private lastDebugText: string;

  constructor(app: Application) {
    this.app = app;
    this.accumulator = 0;

    this.viewport = new Viewport({
      screenWidth: app.renderer.width,
      screenHeight: app.renderer.height,
      events: app.renderer.events,
      disableOnContextMenu: true,
    });

    this.viewport
      .drag({ clampWheel: true })
      .wheel({ percent: 0.1 })
      .pinch()
      .decelerate({ friction: 0.85 });

    app.stage.addChild(this.viewport);

    this.hasPlayerPanned = false;
    this.viewport.on('moved', (event: { type: string }) => {
      if (this.hasPlayerPanned) {
        return;
      }
      if (event.type === 'drag' || event.type === 'pinch' || event.type === 'decelerate') {
        this.hasPlayerPanned = true;
      }
    });

    this.viewport.moveCenter(0, 0);

    this.backgroundLayer = this.createGridLayer();
    this.viewport.addChild(this.backgroundLayer);

    this.rootLayer = new Container();
    this.rootLayer.sortableChildren = true;
    this.viewport.addChild(this.rootLayer);

    this.robotCore = new RobotChassis();
    for (const moduleId of DEFAULT_MODULE_LOADOUT) {
      const moduleInstance = createModuleInstance(moduleId);
      this.robotCore.attachModule(moduleInstance);
    }

    this.resourceLayer = null;
    this.robot = null;
    this.debugOverlay = null;
    this.debugBackground = null;
    this.debugText = null;
    this.lastDebugText = '';
    this.tickHandler = this.tick.bind(this);
    app.ticker.add(this.tickHandler as (ticker: Ticker) => void);

    this.programListeners = new Set();
    this.selectionListeners = new Set();
    this.selectedRobotId = null;
    this.statusIndicator = null;
    this.programRunner = this.robotCore
      ? new BlockProgramRunner(this.robotCore, (status) => this.handleProgramStatus(status))
      : null;
    this.programStatus = this.programRunner?.getStatus() ?? 'idle';

    if (this.robotCore) {
      this.resourceLayer = new ResourceLayer(this.app.renderer, this.robotCore.resourceField);
      this.rootLayer.addChild(this.resourceLayer.view);
    }

    void this.initPlaceholderActors();
  }

  private async initPlaceholderActors(): Promise<void> {
    const texture = await assetService.loadTexture('robot/chassis', this.app.renderer);
    const robot = new Sprite(texture);
    robot.anchor.set(0.5);
    robot.position.set(0, 0);
    robot.eventMode = 'static';
    robot.interactive = true;
    robot.cursor = 'pointer';
    robot.zIndex = 10;
    robot.on('pointerdown', () => {
      this.notifyRobotSelected(DEFAULT_ROBOT_ID);
    });
    robot.on('pointertap', () => {
      this.notifyRobotSelected(DEFAULT_ROBOT_ID);
    });
    this.rootLayer.addChild(robot);

    this.robot = robot;
    this.ensureDebugOverlay();
    this.updateStatusIndicator();
    this.updateDebugOverlay();

    if (!this.hasPlayerPanned) {
      this.viewport.moveCenter(robot.position.x, robot.position.y);
    }
  }

  private createGridLayer(): Container {
    const layer = new Container();

    const grid = new Graphics();
    grid.setStrokeStyle({ width: 1, color: 0x2c3e50, alpha: 0.35 });
    for (let x = -GRID_EXTENT; x <= GRID_EXTENT; x += GRID_SPACING) {
      grid.moveTo(x, -GRID_EXTENT);
      grid.lineTo(x, GRID_EXTENT);
    }
    for (let y = -GRID_EXTENT; y <= GRID_EXTENT; y += GRID_SPACING) {
      grid.moveTo(-GRID_EXTENT, y);
      grid.lineTo(GRID_EXTENT, y);
    }
    grid.stroke();

    const axes = new Graphics();
    axes.setStrokeStyle({ width: 2, color: 0xff6b6b, alpha: 0.75 });
    axes.moveTo(-GRID_EXTENT, 0);
    axes.lineTo(GRID_EXTENT, 0);
    axes.moveTo(0, -GRID_EXTENT);
    axes.lineTo(0, GRID_EXTENT);
    axes.stroke();

    layer.addChild(grid);
    layer.addChild(axes);

    return layer;
  }

  private tick({ deltaMS }: TickPayload): void {
    this.accumulator += deltaMS;

    while (this.accumulator >= STEP_MS) {
      this.step(STEP_MS);
      this.accumulator -= STEP_MS;
    }
  }

  private step(stepMs: number): void {
    const stepSeconds = stepMs / 1000;
    this.viewport.update(stepSeconds * 60);

    if (this.programRunner) {
      this.programRunner.update(stepSeconds);
    }

    if (this.robotCore) {
      this.robotCore.tick(stepSeconds);
    }

    if (this.robot && this.robotCore) {
      const state = this.robotCore.getStateSnapshot();
      this.robot.rotation = state.orientation;
      this.robot.position.set(state.position.x, state.position.y);
    }

    this.updateStatusIndicator();
    this.updateDebugOverlay();
  }

  resize(width: number, height: number): void {
    this.viewport.resize(width, height, width, height);

    if (!this.hasPlayerPanned) {
      const targetX = this.robot?.position.x ?? 0;
      const targetY = this.robot?.position.y ?? 0;
      this.viewport.moveCenter(targetX, targetY);
    }
  }

  runProgram(program: CompiledProgram): void {
    this.programRunner?.load(program);
  }

  stopProgram(): void {
    this.programRunner?.stop();
  }

  getProgramStatus(): ProgramRunnerStatus {
    return this.programStatus;
  }

  getInventorySnapshot(): InventorySnapshot {
    if (!this.robotCore) {
      return { capacity: 0, used: 0, available: 0, entries: [] };
    }
    return this.robotCore.getInventorySnapshot();
  }

  subscribeInventory(listener: (snapshot: InventorySnapshot) => void): () => void {
    if (!this.robotCore) {
      listener({ capacity: 0, used: 0, available: 0, entries: [] });
      return () => {};
    }
    return this.robotCore.inventory.subscribe(listener);
  }

  subscribeProgramStatus(listener: (status: ProgramRunnerStatus) => void): () => void {
    this.programListeners.add(listener);
    listener(this.programStatus);
    return () => {
      this.programListeners.delete(listener);
    };
  }

  subscribeRobotSelection(listener: RobotSelectionListener): () => void {
    this.selectionListeners.add(listener);
    listener(this.selectedRobotId);
    return () => {
      this.selectionListeners.delete(listener);
    };
  }

  selectRobot(robotId: string): void {
    this.notifyRobotSelected(robotId);
  }

  clearRobotSelection(): void {
    this.notifyRobotSelected(null);
  }

  getSelectedRobot(): string | null {
    return this.selectedRobotId;
  }

  private ensureDebugOverlay(): void {
    if (this.debugOverlay) {
      return;
    }

    const container = new Container();
    container.visible = false;
    container.zIndex = 1000;
    container.eventMode = 'none';

    const background = new Graphics();
    container.addChild(background);

    const text = new Text({
      text: '',
      style: {
        fill: 0xffffff,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12,
        lineHeight: 18,
        wordWrap: true,
        wordWrapWidth: DEBUG_MAX_WIDTH - DEBUG_PADDING * 2,
      },
    });
    text.anchor.set(0.5, 0);
    container.addChild(text);

    this.rootLayer.addChild(container);
    this.debugOverlay = container;
    this.debugBackground = background;
    this.debugText = text;
    this.lastDebugText = '';
  }

  private updateDebugOverlay(): void {
    if (!this.robotCore || !this.robot || !this.programRunner) {
      this.hideDebugOverlay();
      return;
    }

    this.ensureDebugOverlay();

    if (!this.debugOverlay || !this.debugBackground || !this.debugText) {
      return;
    }

    const programDebug = this.programRunner.getDebugState();
    const telemetry = this.robotCore.getTelemetrySnapshot();

    const lines: string[] = [];
    const programLines = this.describeProgramDebug(programDebug);
    if (programLines.length > 0) {
      lines.push(...programLines);
    }
    const telemetryLines = this.describeTelemetry(telemetry);
    if (telemetryLines.length > 0) {
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(...telemetryLines);
    }

    if (lines.length === 0) {
      this.hideDebugOverlay();
      return;
    }

    const textContent = lines.join('\n');
    if (textContent !== this.lastDebugText) {
      this.debugText.text = textContent;
      this.lastDebugText = textContent;
    }

    const padding = DEBUG_PADDING;
    const textWidth = this.debugText.width;
    const textHeight = this.debugText.height;
    const backgroundWidth = Math.max(Math.min(textWidth + padding * 2, DEBUG_MAX_WIDTH), DEBUG_MIN_WIDTH);
    const backgroundHeight = textHeight + padding * 2;

    this.debugBackground.clear();
    this.debugBackground.roundRect(
      -backgroundWidth / 2,
      -DEBUG_VERTICAL_OFFSET - backgroundHeight,
      backgroundWidth,
      backgroundHeight,
      DEBUG_CORNER_RADIUS,
    );
    this.debugBackground.fill({ color: DEBUG_BACKGROUND_COLOUR, alpha: 0.9 });
    this.debugBackground.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.35 });
    this.debugBackground.stroke();

    this.debugText.anchor.set(0.5, 0);
    this.debugText.position.set(0, -DEBUG_VERTICAL_OFFSET - backgroundHeight + padding);

    const targetX = this.robot.position.x;
    const targetY = this.robot.position.y;
    this.debugOverlay.position.set(targetX, targetY);

    const scaleX = this.viewport.scale.x || 1;
    const scaleY = this.viewport.scale.y || 1;
    this.debugOverlay.scale.set(1 / scaleX, 1 / scaleY);
    this.debugOverlay.visible = true;
  }

  private hideDebugOverlay(): void {
    if (this.debugOverlay) {
      this.debugOverlay.visible = false;
    }
    this.lastDebugText = '';
  }

  private describeProgramDebug(state: ProgramDebugState | null): string[] {
    if (!state) {
      return [];
    }

    const lines: string[] = [];
    if (state.program) {
      const totalSteps = this.countProgramInstructions(state.program);
      const plural = totalSteps === 1 ? 'step' : 'steps';
      lines.push(`Program: ${state.status.toUpperCase()} • ${totalSteps} ${plural}`);
    } else {
      lines.push(`Program: ${state.status.toUpperCase()}`);
    }

    if (state.currentInstruction) {
      const description = this.formatInstruction(state.currentInstruction);
      const timeRemaining = Math.max(state.timeRemaining, 0).toFixed(1);
      lines.push(`Current: ${description} • ${timeRemaining}s`);
    } else {
      lines.push('Current: —');
    }

    if (state.frames.length > 0) {
      const frameDescription = state.frames
        .map((frame) => this.formatDebugFrame(frame))
        .join(' ▸ ');
      lines.push(`Stack: ${frameDescription}`);
    } else {
      lines.push('Stack: —');
    }

    return lines;
  }

  private formatDebugFrame(frame: ProgramDebugFrame): string {
    if (frame.length <= 0) {
      return frame.kind === 'sequence' ? 'seq —' : 'loop —';
    }
    const label = frame.kind === 'sequence' ? 'seq' : 'loop';
    const index = Math.min(Math.max(frame.index, 0), frame.length - 1) + 1;
    return `${label} ${index}/${frame.length}`;
  }

  private describeTelemetry(snapshot: TelemetrySnapshot): string[] {
    const lines: string[] = [];
    const moduleIds = new Set([
      ...Object.keys(snapshot.values ?? {}),
      ...Object.keys(snapshot.actions ?? {}),
    ]);

    if (moduleIds.size === 0) {
      lines.push('ECS telemetry: —');
      return lines;
    }

    lines.push('ECS telemetry:');
    for (const moduleId of [...moduleIds].sort()) {
      lines.push(`- ${moduleId}`);
      const values = snapshot.values[moduleId] ?? {};
      const valueKeys = Object.keys(values).sort();
      if (valueKeys.length > 0) {
        for (const key of valueKeys) {
          const entry = values[key];
          lines.push(`    ${key}: ${this.formatTelemetryValue(entry.value)}`);
        }
      }

      const actions = snapshot.actions[moduleId] ?? {};
      const actionNames = Object.keys(actions).sort();
      if (actionNames.length > 0) {
        lines.push(`    actions: ${actionNames.join(', ')}`);
      }

      if (valueKeys.length === 0 && actionNames.length === 0) {
        lines.push('    (no signals)');
      }
    }

    return lines;
  }

  private formatInstruction(instruction: BlockInstruction): string {
    switch (instruction.kind) {
      case 'move':
        return `move • speed ${instruction.speed.toFixed(0)} • ${instruction.duration.toFixed(1)}s`;
      case 'turn':
        return `turn • rate ${(instruction.angularVelocity * (180 / Math.PI)).toFixed(0)}°/s • ${instruction.duration.toFixed(1)}s`;
      case 'wait':
        return `wait • ${instruction.duration.toFixed(1)}s`;
      case 'scan':
        return `scan${instruction.filter ? ` • ${instruction.filter}` : ''} • ${instruction.duration.toFixed(1)}s`;
      case 'gather':
        return `gather • ${instruction.duration.toFixed(1)}s`;
      case 'deposit':
        return `deposit • ${instruction.duration.toFixed(1)}s`;
      case 'status-toggle':
        return 'status toggle';
      case 'status-set':
        return `status set • ${instruction.value ? 'on' : 'off'}`;
      case 'loop':
        return `loop • ${instruction.instructions.length} step${instruction.instructions.length === 1 ? '' : 's'}`;
      default:
        return (instruction as { kind?: string }).kind ?? 'unknown';
    }
  }

  private formatTelemetryValue(value: unknown): string {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return String(value);
      }
      if (Math.abs(value) >= 1000) {
        return value.toFixed(0);
      }
      if (Math.abs(value) >= 1) {
        return value.toFixed(1);
      }
      return value.toFixed(2);
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      const items = value.map((entry) => this.formatTelemetryValue(entry));
      const serialised = `[${items.join(', ')}]`;
      return serialised.length > 60 ? `${serialised.slice(0, 57)}…` : serialised;
    }
    if (value && typeof value === 'object') {
      try {
        const serialised = JSON.stringify(value);
        if (!serialised) {
          return 'object';
        }
        return serialised.length > 60 ? `${serialised.slice(0, 57)}…` : serialised;
      } catch (error) {
        return 'object';
      }
    }
    if (value === null) {
      return 'null';
    }
    return typeof value === 'undefined' ? 'undefined' : String(value);
  }

  private countProgramInstructions(program: CompiledProgram | null): number {
    if (!program) {
      return 0;
    }
    return this.countInstructions(program.instructions);
  }

  private countInstructions(instructions: BlockInstruction[] | undefined): number {
    if (!instructions || instructions.length === 0) {
      return 0;
    }

    let total = 0;
    for (const instruction of instructions) {
      total += 1;
      if (instruction.kind === 'loop') {
        total += this.countInstructions(instruction.instructions);
      }
    }
    return total;
  }

  destroy(): void {
    this.app.ticker.remove(this.tickHandler as (ticker: Ticker) => void);
    this.viewport.destroy({ children: true, texture: false });
    this.programRunner?.stop();
    this.programRunner = null;
    this.programListeners.clear();
    this.programStatus = 'idle';
    this.notifyRobotSelected(null);
    this.selectionListeners.clear();
    if (this.debugOverlay) {
      this.debugOverlay.destroy({ children: true });
      this.debugOverlay = null;
      this.debugBackground = null;
      this.debugText = null;
    }
    this.lastDebugText = '';
    if (this.resourceLayer) {
      this.rootLayer.removeChild(this.resourceLayer.view);
      this.resourceLayer.destroy();
      this.resourceLayer = null;
    }
    if (this.robotCore) {
      const modules = [...this.robotCore.moduleStack.list()].reverse();
      for (const module of modules) {
        this.robotCore.detachModule(module.definition.id);
      }
      this.robotCore = null;
    }
    this.robot?.destroy({ children: true });
    this.robot = null;
    this.statusIndicator?.destroy();
    this.statusIndicator = null;
    assetService.disposeAll();
  }

  private handleProgramStatus(status: ProgramRunnerStatus): void {
    this.programStatus = status;
    for (const listener of this.programListeners) {
      listener(status);
    }
  }

  private notifyRobotSelected(robotId: string | null): void {
    if (this.selectedRobotId === robotId) {
      return;
    }
    this.selectedRobotId = robotId;
    for (const listener of this.selectionListeners) {
      listener(robotId);
    }
  }

  private updateStatusIndicator(): void {
    if (!this.robotCore || !this.robot) {
      if (this.statusIndicator) {
        this.statusIndicator.destroy();
        this.statusIndicator = null;
      }
      return;
    }

    const hasStatusModule = Boolean(this.robotCore.moduleStack.getModule(STATUS_MODULE_ID));
    if (!hasStatusModule) {
      if (this.statusIndicator) {
        this.statusIndicator.destroy();
        this.statusIndicator = null;
      }
      return;
    }

    if (!this.statusIndicator) {
      const indicator = new Graphics();
      indicator.circle(0, -36, 6);
      indicator.fill({ color: 0xff6b6b, alpha: 0.95 });
      indicator.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.85 });
      indicator.stroke();
      indicator.position.set(0, 0);
      this.robot.addChild(indicator);
      this.statusIndicator = indicator;
    }

    const telemetry = this.robotCore.getTelemetrySnapshot();
    const statusTelemetry = telemetry.values[STATUS_MODULE_ID];
    const activeEntry = statusTelemetry?.active;
    const isActive = typeof activeEntry?.value === 'boolean' ? activeEntry.value : false;

    this.statusIndicator.alpha = isActive ? 1 : 0.2;
    this.statusIndicator.visible = true;
  }
}
