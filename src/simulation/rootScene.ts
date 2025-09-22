import { Application, Container, Graphics, Sprite, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { assetService } from './assetService';
import { RobotChassis } from './robot';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from './robot/modules/moduleLibrary';
import { STATUS_MODULE_ID } from './robot/modules/statusModule';
import type { CompiledProgram } from './runtime/blockProgram';
import { BlockProgramRunner, type ProgramRunnerStatus } from './runtime/blockProgramRunner';
import type { InventorySnapshot } from './robot/inventory';
import { ResourceLayer } from './resourceLayer';

interface TickPayload {
  deltaMS: number;
}

const STEP_MS = 1000 / 60;
const GRID_EXTENT = 2000;
const GRID_SPACING = 80;
const DEFAULT_ROBOT_ID = 'MF-01';

type RobotSelectionListener = (robotId: string | null) => void;

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
    this.viewport.addChild(this.rootLayer);

    this.robotCore = new RobotChassis();
    for (const moduleId of DEFAULT_MODULE_LOADOUT) {
      const moduleInstance = createModuleInstance(moduleId);
      this.robotCore.attachModule(moduleInstance);
    }

    this.resourceLayer = null;
    this.robot = null;
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
    robot.on('pointerdown', () => {
      this.notifyRobotSelected(DEFAULT_ROBOT_ID);
    });
    robot.on('pointertap', () => {
      this.notifyRobotSelected(DEFAULT_ROBOT_ID);
    });
    this.rootLayer.addChild(robot);

    this.robot = robot;
    this.updateStatusIndicator();

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

  destroy(): void {
    this.app.ticker.remove(this.tickHandler as (ticker: Ticker) => void);
    this.viewport.destroy({ children: true, texture: false });
    this.programRunner?.stop();
    this.programRunner = null;
    this.programListeners.clear();
    this.programStatus = 'idle';
    this.notifyRobotSelected(null);
    this.selectionListeners.clear();
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
