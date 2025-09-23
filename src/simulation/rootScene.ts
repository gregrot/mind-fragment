import { Application, Container, Graphics, Text, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { assetService } from './assetService';
import type { RobotChassis } from './robot';
import { STATUS_MODULE_ID } from './robot/modules/statusModule';
import type { BlockInstruction, CompiledProgram } from './runtime/blockProgram';
import { type ProgramDebugFrame, type ProgramDebugState, type ProgramRunnerStatus } from './runtime/blockProgramRunner';
import { createSimulationWorld, type SimulationWorldContext } from './runtime/simulationWorld';
import type { InventorySnapshot } from './robot/inventory';
import { ResourceLayer } from './resourceLayer';

interface TickPayload {
  deltaMS: number;
}

const STEP_MS = 1000 / 60;
const GRID_EXTENT = 2000;
const GRID_SPACING = 80;
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
  private context: SimulationWorldContext | null;
  private readonly pendingContextCallbacks: Array<{ callback: (context: SimulationWorldContext) => void }>;
  private hasPlayerPanned: boolean;
  private accumulator: number;
  private readonly tickHandler: (payload: TickPayload) => void;
  private programStatus: ProgramRunnerStatus;
  private readonly programListeners: Set<(status: ProgramRunnerStatus) => void>;
  private readonly selectionListeners: Set<RobotSelectionListener>;
  private pendingSelection: string | null;
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

    this.context = null;
    this.pendingContextCallbacks = [];
    this.resourceLayer = null;
    this.debugOverlay = null;
    this.debugBackground = null;
    this.debugText = null;
    this.lastDebugText = '';
    this.tickHandler = this.tick.bind(this);
    app.ticker.add(this.tickHandler as (ticker: Ticker) => void);

    this.programListeners = new Set();
    this.selectionListeners = new Set();
    this.pendingSelection = null;
    this.statusIndicator = null;
    this.programStatus = 'idle';

    void this.initialiseSimulationWorld();
  }

  private async initialiseSimulationWorld(): Promise<void> {
    const context = await createSimulationWorld({
      renderer: this.app.renderer,
      onRobotSelected: (robotId) => this.notifyRobotSelected(robotId),
    });

    this.context = context;

    const robotCore = context.getRobotCore();
    if (robotCore) {
      this.resourceLayer = new ResourceLayer(this.app.renderer, robotCore.resourceField);
      this.rootLayer.addChild(this.resourceLayer.view);
    }

    const sprite = context.getSprite();
    if (sprite) {
      this.rootLayer.addChild(sprite);
    }

    const programRunner = context.getProgramRunner();
    if (programRunner) {
      programRunner.setStatusListener((status) => this.handleProgramStatus(status));
      this.programStatus = programRunner.getStatus();
    } else {
      this.programStatus = 'idle';
    }

    const transform = context.getTransform();
    if (transform && sprite) {
      sprite.position.set(transform.position.x, transform.position.y);
      sprite.rotation = transform.rotation;
    }

    if (this.pendingSelection !== null) {
      if (context.getSelectedRobot() !== this.pendingSelection) {
        context.selectRobot(this.pendingSelection);
      }
    } else if (context.getSelectedRobot() !== null) {
      context.selectRobot(null);
    }

    this.flushPendingContextCallbacks(context);

    if (!this.hasPlayerPanned && sprite) {
      this.viewport.moveCenter(sprite.position.x, sprite.position.y);
    }

    this.updateStatusIndicator();
    this.updateDebugOverlay();
  }

  private flushPendingContextCallbacks(context: SimulationWorldContext): void {
    const callbacks = [...this.pendingContextCallbacks];
    this.pendingContextCallbacks.length = 0;
    for (const entry of callbacks) {
      entry.callback(context);
    }
  }

  private onContextReady(callback: (context: SimulationWorldContext) => void): () => void {
    if (this.context) {
      callback(this.context);
      return () => {};
    }
    const entry = { callback } as const;
    this.pendingContextCallbacks.push(entry);
    return () => {
      const index = this.pendingContextCallbacks.indexOf(entry);
      if (index >= 0) {
        this.pendingContextCallbacks.splice(index, 1);
      }
    };
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

    const context = this.context;
    const programRunner = context?.getProgramRunner();
    if (programRunner) {
      programRunner.update(stepSeconds);
    }

    if (context) {
      const robotCore = context.getRobotCore();
      if (robotCore) {
        robotCore.tick(stepSeconds);
        const state = robotCore.getStateSnapshot();
        context.setTransform(context.entities.robot, {
          position: { x: state.position.x, y: state.position.y },
          rotation: state.orientation,
        });
        const sprite = context.getSprite();
        if (sprite) {
          sprite.rotation = state.orientation;
          sprite.position.set(state.position.x, state.position.y);
        }
      }
    }

    this.updateStatusIndicator();
    this.updateDebugOverlay();
  }

  resize(width: number, height: number): void {
    this.viewport.resize(width, height, width, height);

    if (!this.hasPlayerPanned) {
      const sprite = this.context?.getSprite();
      const targetX = sprite?.position.x ?? 0;
      const targetY = sprite?.position.y ?? 0;
      this.viewport.moveCenter(targetX, targetY);
    }
  }

  runProgram(program: CompiledProgram): void {
    const execute = (context: SimulationWorldContext) => {
      context.getProgramRunner()?.load(program);
    };
    if (this.context) {
      execute(this.context);
      return;
    }
    this.onContextReady(execute);
  }

  stopProgram(): void {
    const execute = (context: SimulationWorldContext) => {
      context.getProgramRunner()?.stop();
    };
    if (this.context) {
      execute(this.context);
      return;
    }
    this.onContextReady(execute);
  }

  getProgramStatus(): ProgramRunnerStatus {
    return this.programStatus;
  }

  getInventorySnapshot(): InventorySnapshot {
    const robotCore = this.context?.getRobotCore();
    if (!robotCore) {
      return { capacity: 0, used: 0, available: 0, entries: [] };
    }
    return robotCore.getInventorySnapshot();
  }

  subscribeInventory(listener: (snapshot: InventorySnapshot) => void): () => void {
    listener(this.getInventorySnapshot());

    let unsubscribed = false;
    let teardown: (() => void) | null = null;

    const cancelReady = this.onContextReady((context) => {
      if (unsubscribed) {
        return;
      }
      const robotCore = context.getRobotCore();
      if (!robotCore) {
        return;
      }
      teardown = robotCore.inventory.subscribe(listener);
    });

    return () => {
      unsubscribed = true;
      cancelReady();
      teardown?.();
      teardown = null;
    };
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
    listener(this.pendingSelection);
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
    return this.pendingSelection;
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
    const context = this.context;
    if (!context) {
      this.hideDebugOverlay();
      return;
    }

    const robotCore = context.getRobotCore();
    const sprite = context.getSprite();
    const programRunner = context.getProgramRunner();
    if (!robotCore || !sprite || !programRunner) {
      this.hideDebugOverlay();
      return;
    }

    this.ensureDebugOverlay();

    if (!this.debugOverlay || !this.debugBackground || !this.debugText) {
      return;
    }

    const programDebug = programRunner.getDebugState();
    const telemetry = robotCore.getTelemetrySnapshot();

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

    const targetX = sprite.position.x;
    const targetY = sprite.position.y;
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
    this.programListeners.clear();
    this.programStatus = 'idle';
    this.notifyRobotSelected(null);
    this.selectionListeners.clear();
    this.pendingContextCallbacks.length = 0;
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
    const context = this.context;
    if (context) {
      context.getProgramRunner()?.stop();

      const robotCore = context.getRobotCore();
      if (robotCore) {
        const modules = [...robotCore.moduleStack.list()].reverse();
        for (const module of modules) {
          robotCore.detachModule(module.definition.id);
        }
      }

      const sprite = context.getSprite();
      sprite?.destroy({ children: true });

      context.world.destroyEntity(context.entities.robot);
      context.world.destroyEntity(context.entities.selection);
      this.context = null;
    }
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
    if (this.pendingSelection === robotId) {
      return;
    }
    this.pendingSelection = robotId;
    if (this.context) {
      const current = this.context.getSelectedRobot();
      if (current !== robotId) {
        this.context.selectRobot(robotId);
      }
    }
    for (const listener of this.selectionListeners) {
      listener(robotId);
    }
  }

  private updateStatusIndicator(): void {
    const context = this.context;
    const robotCore = context?.getRobotCore();
    const sprite = context?.getSprite();
    if (!robotCore || !sprite) {
      if (this.statusIndicator) {
        this.statusIndicator.destroy();
        this.statusIndicator = null;
      }
      return;
    }

    const hasStatusModule = Boolean(robotCore.moduleStack.getModule(STATUS_MODULE_ID));
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
      sprite.addChild(indicator);
      this.statusIndicator = indicator;
    }

    const telemetry = robotCore.getTelemetrySnapshot();
    const statusTelemetry = telemetry.values[STATUS_MODULE_ID];
    const activeEntry = statusTelemetry?.active;
    const isActive = typeof activeEntry?.value === 'boolean' ? activeEntry.value : false;

    this.statusIndicator.alpha = isActive ? 1 : 0.2;
    this.statusIndicator.visible = true;
  }
}
