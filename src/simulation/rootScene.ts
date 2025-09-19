import { Application, Renderer, Container, Graphics, Sprite, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { assetService } from './assetService';
import { RobotChassis } from './robot';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from './robot/modules/moduleLibrary';

interface TickPayload {
  deltaMS: number;
}

const STEP_MS = 1000 / 60;
const GRID_EXTENT = 2000;
const GRID_SPACING = 80;

export class RootScene {
  private readonly app: Application;
  private readonly viewport: Viewport;
  private readonly backgroundLayer: Container;
  private readonly rootLayer: Container;
  private robotCore: RobotChassis | null;
  private robot: Sprite | null;
  private accumulator: number;
  private readonly tickHandler: (payload: TickPayload) => void;

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

    this.backgroundLayer = this.createGridLayer();
    this.viewport.addChild(this.backgroundLayer);

    this.rootLayer = new Container();
    this.viewport.addChild(this.rootLayer);

    this.robotCore = new RobotChassis();
    for (const moduleId of DEFAULT_MODULE_LOADOUT) {
      const moduleInstance = createModuleInstance(moduleId);
      this.robotCore.attachModule(moduleInstance);
    }

    this.robot = null;
    this.tickHandler = this.tick.bind(this);
    app.ticker.add(this.tickHandler as (ticker: Ticker) => void);

    void this.initPlaceholderActors();
  }

  private async initPlaceholderActors(): Promise<void> {
    const texture = await assetService.loadTexture('robot/chassis', this.app.renderer);
    const robot = new Sprite(texture);
    robot.anchor.set(0.5);
    robot.position.set(0, 0);
    this.rootLayer.addChild(robot);

    this.robot = robot;
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

    if (this.robotCore) {
      this.robotCore.tick(stepSeconds);
    }

    if (this.robot && this.robotCore) {
      const state = this.robotCore.getStateSnapshot();
      this.robot.rotation = state.orientation;
      this.robot.position.set(state.position.x, state.position.y);
    }
  }

  resize(width: number, height: number): void {
    this.viewport.resize(width, height, width, height);
  }

  destroy(): void {
    this.app.ticker.remove(this.tickHandler as (ticker: Ticker) => void);
    this.viewport.destroy({ children: true, texture: false });
    if (this.robotCore) {
      const modules = [...this.robotCore.moduleStack.list()].reverse();
      for (const module of modules) {
        this.robotCore.detachModule(module.definition.id);
      }
      this.robotCore = null;
    }
    this.robot?.destroy({ children: true });
    this.robot = null;
    assetService.disposeAll();
  }
}
