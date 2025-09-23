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
import { createSimulationWorld, type SimulationWorldContext } from './runtime/simulationWorld';
import {
  type ModuleStateSnapshot,
  EMPTY_MODULE_STATE,
  type ModuleStoreResult,
  type ModuleMountResult,
  type ModuleDropResult,
  type ModulePickupResult,
} from './robot/RobotChassis';
import type { InventorySnapshot } from './robot/inventory';

interface TickPayload {
  deltaMS: number;
}

const STEP_MS = 1000 / 60;
const GRID_EXTENT = 2000;
const GRID_SPACING = 80;
type RobotSelectionListener = (robotId: string | null) => void;
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
  private programStatus: ProgramRunnerStatus;
  private readonly programListeners: Set<(status: ProgramRunnerStatus) => void>;
  private readonly selectionListeners: Set<RobotSelectionListener>;
  private pendingSelection: string | null;
  private readonly telemetryListeners: Set<TelemetryListener>;
  private telemetrySnapshot: SimulationTelemetrySnapshot;
  private telemetrySignature: string | null;
  private telemetryRobotId: string | null;
  private readonly moduleStateListeners: Set<(snapshot: ModuleStateSnapshot) => void>;
  private moduleStateSnapshot: ModuleStateSnapshot;
  private moduleStateUnsubscribe: (() => void) | null = null;

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

    this.programListeners = new Set();
    this.selectionListeners = new Set();
    this.pendingSelection = null;
    this.programStatus = 'idle';
    this.telemetryListeners = new Set();
    this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
    this.telemetrySignature = null;
    this.telemetryRobotId = null;
    this.moduleStateListeners = new Set();
    this.moduleStateSnapshot = EMPTY_MODULE_STATE;
    this.moduleStateUnsubscribe = null;

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

    context.world.runSystems(0);

    const sprite = context.getSprite();
    if (sprite) {
      this.rootLayer.addChild(sprite);
    }

    const robotCore = context.getRobotCore();
    const previousModuleUnsubscribe = this.moduleStateUnsubscribe as (() => void) | null;
    if (previousModuleUnsubscribe) {
      previousModuleUnsubscribe();
    }
    if (robotCore) {
      this.moduleStateUnsubscribe = robotCore.subscribeModules((snapshot) => {
        this.moduleStateSnapshot = snapshot;
        this.notifyModuleStateListeners();
      });
      this.moduleStateSnapshot = robotCore.getModuleStateSnapshot();
    } else {
      this.moduleStateUnsubscribe = null;
      this.moduleStateSnapshot = EMPTY_MODULE_STATE;
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

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    listener(this.getTelemetrySnapshot(), this.telemetryRobotId);
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

  getTelemetrySnapshot(): SimulationTelemetrySnapshot {
    if (!this.context) {
      return this.telemetrySnapshot;
    }
    this.captureTelemetrySnapshot();
    return this.telemetrySnapshot;
  }

  destroy(): void {
    this.app.ticker.remove(this.tickHandler as (ticker: Ticker) => void);
    this.programListeners.clear();
    this.programStatus = 'idle';
    this.notifyRobotSelected(null);
    this.selectionListeners.clear();
    this.telemetryListeners.clear();
    this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
    this.telemetrySignature = null;
    this.telemetryRobotId = null;
    this.moduleStateListeners.clear();
    this.moduleStateSnapshot = EMPTY_MODULE_STATE;
    const pendingModuleUnsubscribe = this.moduleStateUnsubscribe as (() => void) | null;
    if (pendingModuleUnsubscribe) {
      pendingModuleUnsubscribe();
    }
    this.moduleStateUnsubscribe = null;
    this.pendingContextCallbacks.length = 0;
    const context = this.context;
    if (context) {
      context.getProgramRunner()?.stop();

      const robotCore = context.getRobotCore();
      if (robotCore) {
        const teardownModules = this.moduleStateUnsubscribe as (() => void) | null;
        if (teardownModules) {
          teardownModules();
        }
        this.moduleStateUnsubscribe = null;
        const modules = [...robotCore.moduleStack.list()].reverse();
        for (const module of modules) {
          robotCore.detachModule(module.definition.id);
        }
      }

      const sprite = context.getSprite();
      sprite?.destroy({ children: true });

      context.world.destroyEntity(context.entities.robot);
      context.world.destroyEntity(context.entities.selection);
      context.world.runSystems(0);
      context.blackboard.clear();
      this.context = null;
    }
    this.viewport.destroy({ children: true, texture: false });
    assetService.disposeAll();
  }

  getModuleStateSnapshot(): ModuleStateSnapshot {
    return this.moduleStateSnapshot;
  }

  subscribeModuleState(listener: (snapshot: ModuleStateSnapshot) => void): () => void {
    this.moduleStateListeners.add(listener);
    listener(this.moduleStateSnapshot);
    return () => {
      this.moduleStateListeners.delete(listener);
    };
  }

  async storeModule(moduleId: string): Promise<ModuleStoreResult> {
    const trimmedId = moduleId.trim().toLowerCase();
    return this.runWithRobotCore<ModuleStoreResult>(
      (robotCore) => robotCore.storeModule(trimmedId),
      () => ({ success: false, moduleId: trimmedId, reason: 'not-found' } satisfies ModuleStoreResult),
    );
  }

  async mountModule(moduleId: string): Promise<ModuleMountResult> {
    const trimmedId = moduleId.trim().toLowerCase();
    return this.runWithRobotCore<ModuleMountResult>(
      (robotCore) => robotCore.mountModule(trimmedId),
      () => ({ success: false, moduleId: trimmedId, reason: 'not-found' } satisfies ModuleMountResult),
    );
  }

  async dropModule(moduleId: string, amount = 1): Promise<ModuleDropResult> {
    const trimmedId = moduleId.trim().toLowerCase();
    return this.runWithRobotCore<ModuleDropResult>(
      (robotCore) => robotCore.dropModule(trimmedId, amount),
      () => ({ success: false, moduleId: trimmedId, reason: 'not-available' } satisfies ModuleDropResult),
    );
  }

  async pickUpModule(nodeId: string, amount = 1): Promise<ModulePickupResult> {
    const executor = (
      robotCore: ReturnType<SimulationWorldContext['getRobotCore']>,
    ): ModulePickupResult =>
      robotCore
        ? robotCore.pickUpModule(nodeId, amount)
        : { success: false, moduleId: '', nodeId, reason: 'not-found' };
    if (this.context) {
      return executor(this.context.getRobotCore());
    }
    return new Promise<ModulePickupResult>((resolve) => {
      this.onContextReady((context) => {
        resolve(executor(context.getRobotCore()));
      });
    });
  }

  private handleProgramStatus(status: ProgramRunnerStatus): void {
    const previousStatus = this.programStatus;
    this.programStatus = status;
    const blackboard = this.context?.blackboard;
    if (blackboard) {
      blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus, status);
      if (previousStatus !== status) {
        blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.ProgramStatusChanged, status);
      }
    }
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
    this.captureTelemetrySnapshot(true);
  }

  private captureTelemetrySnapshot(force = false): void {
    const context = this.context;
    if (!context) {
      if (force && this.telemetrySignature !== null) {
        this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
        this.telemetrySignature = null;
        this.telemetryRobotId = null;
        this.notifyTelemetryListeners();
      }
      return;
    }

    const robotCore = context.getRobotCore();
    if (!robotCore) {
      return;
    }

    const snapshot = robotCore.getTelemetrySnapshot();
    const signature = JSON.stringify(snapshot);
    const robotId = context.getSelectedRobot();
    const hasChanged =
      force ||
      this.telemetrySignature !== signature ||
      this.telemetryRobotId !== (robotId ?? null);

    if (!hasChanged) {
      return;
    }

    this.telemetrySnapshot = snapshot;
    this.telemetrySignature = signature;
    this.telemetryRobotId = robotId ?? null;
    this.notifyTelemetryListeners();
  }

  private notifyTelemetryListeners(): void {
    for (const listener of this.telemetryListeners) {
      listener(this.telemetrySnapshot, this.telemetryRobotId);
    }
  }

  private notifyModuleStateListeners(): void {
    for (const listener of this.moduleStateListeners) {
      listener(this.moduleStateSnapshot);
    }
  }

  private async runWithRobotCore<T>(
    callback: (robotCore: NonNullable<ReturnType<SimulationWorldContext['getRobotCore']>>) => T,
    fallbackFactory: () => T,
  ): Promise<T> {
    const execute = (robotCore: ReturnType<SimulationWorldContext['getRobotCore']>) => {
      if (!robotCore) {
        return fallbackFactory();
      }
      return callback(robotCore);
    };

    if (this.context) {
      return execute(this.context.getRobotCore());
    }

    return new Promise((resolve) => {
      this.onContextReady((context) => {
        resolve(execute(context.getRobotCore()));
      });
    });
  }
}
