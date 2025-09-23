import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { assetService } from './assetService';
import type { CompiledProgram } from './runtime/blockProgram';
import { type ProgramRunnerStatus } from './runtime/blockProgramRunner';
import { createSimulationWorld, type SimulationWorldContext } from './runtime/simulationWorld';
import type { InventorySnapshot } from './robot/inventory';

interface TickPayload {
  deltaMS: number;
}

const STEP_MS = 1000 / 60;
const GRID_EXTENT = 2000;
const GRID_SPACING = 80;
type RobotSelectionListener = (robotId: string | null) => void;

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

  destroy(): void {
    this.app.ticker.remove(this.tickHandler as (ticker: Ticker) => void);
    this.programListeners.clear();
    this.programStatus = 'idle';
    this.notifyRobotSelected(null);
    this.selectionListeners.clear();
    this.pendingContextCallbacks.length = 0;
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
      context.world.runSystems(0);
      this.context = null;
    }
    this.viewport.destroy({ children: true, texture: false });
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

}
