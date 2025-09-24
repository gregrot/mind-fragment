import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { assetService } from './assetService';
import type { CompiledProgram } from './runtime/blockProgram';
import { type ProgramRunnerStatus } from './runtime/blockProgramRunner';
import {
  SIMULATION_BLACKBOARD_EVENT_KEYS,
  SIMULATION_BLACKBOARD_FACT_KEYS,
  type SimulationTelemetrySnapshot,
} from './runtime/ecsBlackboard';
import { createSimulationWorld, DEFAULT_ROBOT_ID, type SimulationWorldContext } from './runtime/simulationWorld';
import type { EntityId } from './ecs/world';
import type { InventorySnapshot } from './robot/inventory';

interface TickPayload {
  deltaMS: number;
}

const STEP_MS = 1000 / 60;
const GRID_EXTENT = 2000;
const GRID_SPACING = 80;
type RobotSelectionListener = (robotId: string | null, entityId: EntityId | null) => void;
type TelemetryListener = (
  snapshot: SimulationTelemetrySnapshot,
  robotId: string | null,
) => void;

const EMPTY_TELEMETRY_SNAPSHOT: SimulationTelemetrySnapshot = {
  values: {},
  actions: {},
};

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
  private readonly programStatusByRobot: Map<string, ProgramRunnerStatus>;
  private programStatus: ProgramRunnerStatus;
  private readonly programListeners: Set<(status: ProgramRunnerStatus, robotId: string) => void>;
  private readonly selectionListeners: Set<RobotSelectionListener>;
  private pendingSelection: string | null;
  private readonly telemetryListeners: Set<TelemetryListener>;
  private telemetrySnapshot: SimulationTelemetrySnapshot;
  private telemetryRobotId: string | null;
  private readonly telemetrySnapshotsByRobot: Map<
    string,
    { snapshot: SimulationTelemetrySnapshot; signature: string }
  >;
  private defaultRobotId: string;

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
    this.tickHandler = this.tick.bind(this);
    app.ticker.add(this.tickHandler as (ticker: Ticker) => void);

    this.programStatusByRobot = new Map();
    this.programListeners = new Set();
    this.selectionListeners = new Set();
    this.pendingSelection = null;
    this.defaultRobotId = DEFAULT_ROBOT_ID;
    this.programStatus = 'idle';
    this.telemetryListeners = new Set();
    this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
    this.telemetryRobotId = null;
    this.telemetrySnapshotsByRobot = new Map();

    void this.initialiseSimulationWorld();
  }

  private async initialiseSimulationWorld(): Promise<void> {
    const context = await createSimulationWorld({
      renderer: this.app.renderer,
      onRobotSelected: (robotId) => this.notifyRobotSelected(robotId),
      overlayLayer: this.rootLayer,
      viewport: this.viewport,
    });

    this.context = context;
    this.defaultRobotId = context.defaultRobotId ?? DEFAULT_ROBOT_ID;

    context.world.runSystems(0);

    this.telemetrySnapshotsByRobot.clear();
    this.programStatusByRobot.clear();

    for (const robotId of context.entities.robots.keys()) {
      const sprite = context.getSprite(robotId);
      if (sprite && sprite.parent !== this.rootLayer) {
        this.rootLayer.addChild(sprite);
      }

      const transform = context.getTransform(robotId);
      if (transform && sprite) {
        sprite.position.set(transform.position.x, transform.position.y);
        sprite.rotation = transform.rotation;
      }

      const programRunner = context.getProgramRunner(robotId);
      if (programRunner) {
        programRunner.setStatusListener((status) => this.handleProgramStatus(robotId, status));
        this.programStatusByRobot.set(robotId, programRunner.getStatus());
      } else {
        this.programStatusByRobot.set(robotId, 'idle');
      }
    }

    const targetSelection =
      this.pendingSelection ?? context.getSelectedRobot() ?? this.defaultRobotId ?? DEFAULT_ROBOT_ID;
    if (context.getSelectedRobot() !== targetSelection) {
      context.selectRobot(targetSelection);
    }
    this.pendingSelection = targetSelection;
    this.updateProgramStatusForSelection();

    this.flushPendingContextCallbacks(context);

    if (!this.hasPlayerPanned) {
      const focusRobotId = this.getActiveRobotId(context);
      const focusSprite = context.getSprite(focusRobotId);
      if (focusSprite) {
        this.viewport.moveCenter(focusSprite.position.x, focusSprite.position.y);
      }
    }

    this.captureTelemetrySnapshot(true);

    // Presentation systems are responsible for updating overlay components.
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
    context?.world.runSystems(stepSeconds);

    this.captureTelemetrySnapshot();

  }

  resize(width: number, height: number): void {
    this.viewport.resize(width, height, width, height);

    if (!this.hasPlayerPanned) {
      const context = this.context;
      const robotId = this.getActiveRobotId(context);
      const sprite = context?.getSprite(robotId);
      const targetX = sprite?.position.x ?? 0;
      const targetY = sprite?.position.y ?? 0;
      this.viewport.moveCenter(targetX, targetY);
    }
  }

  runProgram(robotId: string, program: CompiledProgram): void {
    const execute = (context: SimulationWorldContext) => {
      context.getProgramRunner(robotId)?.load(program);
    };
    if (this.context) {
      execute(this.context);
      return;
    }
    this.onContextReady(execute);
  }

  stopProgram(robotId: string): void {
    const execute = (context: SimulationWorldContext) => {
      context.getProgramRunner(robotId)?.stop();
    };
    if (this.context) {
      execute(this.context);
      return;
    }
    this.onContextReady(execute);
  }

  getProgramStatus(robotId: string = this.getActiveRobotId()): ProgramRunnerStatus {
    return this.programStatusByRobot.get(robotId) ?? 'idle';
  }

  getInventorySnapshot(robotId: string = this.getActiveRobotId()): InventorySnapshot {
    const robotCore = this.context?.getRobotCore(robotId);
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
      const robotId = this.getActiveRobotId(context);
      const robotCore = context.getRobotCore(robotId);
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

  subscribeProgramStatus(listener: (status: ProgramRunnerStatus, robotId: string) => void): () => void {
    this.programListeners.add(listener);
    for (const [robotId, status] of this.programStatusByRobot) {
      listener(status, robotId);
    }
    if (this.programStatusByRobot.size === 0) {
      listener(this.programStatus, this.getActiveRobotId());
    }
    return () => {
      this.programListeners.delete(listener);
    };
  }

  subscribeRobotSelection(listener: RobotSelectionListener): () => void {
    this.selectionListeners.add(listener);
    const entityId =
      this.pendingSelection && this.context
        ? this.context.getRobotEntity(this.pendingSelection) ?? null
        : null;
    listener(this.pendingSelection, entityId);
    return () => {
      this.selectionListeners.delete(listener);
    };
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    if (this.telemetrySnapshotsByRobot.size > 0) {
      for (const [robotId, entry] of this.telemetrySnapshotsByRobot) {
        listener(entry.snapshot, robotId);
      }
    } else {
      listener(this.telemetrySnapshot, this.telemetryRobotId);
    }
    return () => {
      this.telemetryListeners.delete(listener);
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

  getTelemetrySnapshot(robotId: string = this.getActiveRobotId()): SimulationTelemetrySnapshot {
    if (!this.context) {
      const cached = this.telemetrySnapshotsByRobot.get(robotId);
      if (cached) {
        return cached.snapshot;
      }
      if (this.telemetryRobotId === robotId) {
        return this.telemetrySnapshot;
      }
      return EMPTY_TELEMETRY_SNAPSHOT;
    }
    this.captureTelemetrySnapshot();
    const entry = this.telemetrySnapshotsByRobot.get(robotId);
    if (entry) {
      return entry.snapshot;
    }
    if (this.telemetryRobotId === robotId) {
      return this.telemetrySnapshot;
    }
    return EMPTY_TELEMETRY_SNAPSHOT;
  }

  destroy(): void {
    this.app.ticker.remove(this.tickHandler as (ticker: Ticker) => void);
    this.programListeners.clear();
    this.programStatusByRobot.clear();
    this.programStatus = 'idle';
    this.notifyRobotSelected(null);
    this.selectionListeners.clear();
    this.telemetryListeners.clear();
    this.telemetrySnapshotsByRobot.clear();
    this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
    this.telemetryRobotId = null;
    this.pendingContextCallbacks.length = 0;
    this.defaultRobotId = DEFAULT_ROBOT_ID;
    const context = this.context;
    if (context) {
      for (const robotId of context.entities.robots.keys()) {
        context.getProgramRunner(robotId)?.stop();

        const robotCore = context.getRobotCore(robotId);
        if (robotCore) {
          const modules = [...robotCore.moduleStack.list()].reverse();
          for (const module of modules) {
            robotCore.detachModule(module.definition.id);
          }
        }

        const sprite = context.getSprite(robotId);
        sprite?.destroy({ children: true });

        const entity = context.entities.robots.get(robotId);
        if (entity !== undefined) {
          context.world.destroyEntity(entity);
        }
      }
      context.world.destroyEntity(context.entities.selection);
      context.world.runSystems(0);
      context.blackboard.clear();
      this.context = null;
    }
    this.viewport.destroy({ children: true, texture: false });
    assetService.disposeAll();
  }

  private handleProgramStatus(robotId: string, status: ProgramRunnerStatus): void {
    this.programStatusByRobot.set(robotId, status);
    if (this.getActiveRobotId() === robotId) {
      this.applyProgramStatusForActiveRobot(robotId, status);
    }
    for (const listener of this.programListeners) {
      listener(status, robotId);
    }
  }

  private updateProgramStatusForSelection(): void {
    const activeRobotId = this.getActiveRobotId();
    const status = this.programStatusByRobot.get(activeRobotId) ?? 'idle';
    this.applyProgramStatusForActiveRobot(activeRobotId, status);
  }

  private applyProgramStatusForActiveRobot(robotId: string, status: ProgramRunnerStatus): void {
    const previousStatus = this.programStatus;
    this.programStatus = status;
    const blackboard = this.context?.blackboard;
    if (blackboard) {
      blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus, status);
      if (previousStatus !== status) {
        blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.ProgramStatusChanged, status);
      }
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
      if (!this.hasPlayerPanned && robotId) {
        const sprite = this.context.getSprite(robotId);
        if (sprite) {
          this.viewport.moveCenter(sprite.position.x, sprite.position.y);
        }
      }
    }
    const entityId =
      robotId && this.context ? this.context.getRobotEntity(robotId) ?? null : null;
    for (const listener of this.selectionListeners) {
      listener(robotId, entityId);
    }
    this.updateProgramStatusForSelection();
    this.captureTelemetrySnapshot(true);
  }

  private getActiveRobotId(context: SimulationWorldContext | null = this.context): string {
    const fallback = context?.defaultRobotId ?? this.defaultRobotId ?? DEFAULT_ROBOT_ID;
    const selected = this.pendingSelection ?? context?.getSelectedRobot() ?? fallback;
    if (!context) {
      return selected ?? fallback;
    }
    if (selected && context.entities.robots.has(selected)) {
      return selected;
    }
    const iterator = context.entities.robots.keys();
    const next = iterator.next();
    if (!next.done) {
      return next.value;
    }
    return fallback;
  }

  private captureTelemetrySnapshot(force = false): void {
    const context = this.context;
    if (!context) {
      if (force && (this.telemetrySnapshotsByRobot.size > 0 || this.telemetryRobotId !== null)) {
        this.telemetrySnapshotsByRobot.clear();
        this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
        this.telemetryRobotId = null;
        this.notifyTelemetryListeners(null, this.telemetrySnapshot);
      }
      return;
    }

    const activeRobotId = this.getActiveRobotId(context);
    let hasActiveSnapshot = false;

    for (const robotId of context.entities.robots.keys()) {
      const robotCore = context.getRobotCore(robotId);
      if (!robotCore) {
        continue;
      }
      const snapshot = robotCore.getTelemetrySnapshot();
      const signature = JSON.stringify(snapshot);
      const existing = this.telemetrySnapshotsByRobot.get(robotId);
      const hasChanged = force || !existing || existing.signature !== signature;
      if (hasChanged) {
        this.telemetrySnapshotsByRobot.set(robotId, { snapshot, signature });
        this.notifyTelemetryListeners(robotId, snapshot);
      }
      if (robotId === activeRobotId) {
        this.telemetrySnapshot = snapshot;
        this.telemetryRobotId = robotId;
        hasActiveSnapshot = true;
      }
    }

    if (!hasActiveSnapshot) {
      const activeEntry = this.telemetrySnapshotsByRobot.get(activeRobotId);
      if (activeEntry) {
        this.telemetrySnapshot = activeEntry.snapshot;
        this.telemetryRobotId = activeRobotId;
      } else if (force) {
        this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
        this.telemetryRobotId = null;
        this.notifyTelemetryListeners(null, this.telemetrySnapshot);
      }
    }
  }

  private notifyTelemetryListeners(
    robotId: string | null,
    snapshot: SimulationTelemetrySnapshot,
  ): void {
    for (const listener of this.telemetryListeners) {
      listener(snapshot, robotId);
    }
  }
}
