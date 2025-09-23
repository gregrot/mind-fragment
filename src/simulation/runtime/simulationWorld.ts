import { Container, Graphics, Sprite, Text, type Renderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { assetService } from '../assetService';
import { ECSWorld, type ComponentHandle, type EntityId } from '../ecs';
import {
  createDebugOverlaySystem,
  createProgramRunnerSystem,
  createResourceFieldViewSystem,
  createRobotPhysicsSystem,
  createSelectableSystem,
  createSpriteSyncSystem,
  createStatusIndicatorSystem,
} from '../ecs/systems';
import { RobotChassis } from '../robot';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from '../robot/modules/moduleLibrary';
import { BlockProgramRunner } from './blockProgramRunner';
import { STATUS_MODULE_ID } from '../robot/modules/statusModule';
import type { ResourceLayer } from '../resourceLayer';
import type { ResourceField } from '../resources/resourceField';
import {
  ECSBlackboard,
  SIMULATION_BLACKBOARD_EVENT_KEYS,
  SIMULATION_BLACKBOARD_FACT_KEYS,
  type SimulationBlackboardEvents,
  type SimulationBlackboardFacts,
  type SimulationTelemetrySnapshot,
} from './ecsBlackboard';

export const DEBUG_PADDING = 8;
export const DEBUG_VERTICAL_OFFSET = 72;
export const DEBUG_CORNER_RADIUS = 8;
export const DEBUG_MAX_WIDTH = 280;
export const DEBUG_MIN_WIDTH = 180;
export const DEBUG_BACKGROUND_COLOUR = 0x0b1623;

export const DEFAULT_ROBOT_ID = 'MF-01';

export interface TransformComponent {
  position: { x: number; y: number };
  rotation: number;
}

export interface ViewportTargetComponent {
  kind: 'primary';
  priority: number;
}

export interface SelectionStateComponent {
  robotId: string | null;
}

export interface ResourceFieldViewComponent {
  resourceField: ResourceField;
  layer: ResourceLayer | null;
}

export interface SelectableComponent {
  id: string;
  onSelected?: (id: string | null) => void;
}

export interface SimulationWorldComponents {
  Transform: ComponentHandle<TransformComponent>;
  SpriteRef: ComponentHandle<Sprite>;
  RobotCore: ComponentHandle<RobotChassis>;
  ProgramRunner: ComponentHandle<BlockProgramRunner>;
  ViewportTarget: ComponentHandle<ViewportTargetComponent>;
  SelectionState: ComponentHandle<SelectionStateComponent>;
  RobotId: ComponentHandle<string>;
  DebugOverlay: ComponentHandle<DebugOverlayComponent>;
  StatusIndicator: ComponentHandle<StatusIndicatorComponent>;
  ResourceFieldView: ComponentHandle<ResourceFieldViewComponent>;
  Selectable: ComponentHandle<SelectableComponent>;
}

export interface SimulationWorldEntities {
  robots: Map<string, EntityId>;
  selection: EntityId;
}

export interface SimulationWorldContext {
  world: ECSWorld;
  components: SimulationWorldComponents;
  entities: SimulationWorldEntities;
  blackboard: ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>;
  defaultRobotId: string;
  getRobotCore(robotId?: string): RobotChassis | null;
  getProgramRunner(robotId?: string): BlockProgramRunner | null;
  getSprite(robotId?: string): Sprite | null;
  getTransform(robotId?: string): TransformComponent | null;
  setTransform(robotId: string, transform: TransformComponent): void;
  getRobotId(entity: EntityId): string | null;
  getRobotEntity(robotId: string): EntityId | null;
  selectRobot(robotId: string | null): void;
  getSelectedRobot(): string | null;
}

interface CreateSimulationWorldOptions {
  renderer: Renderer;
  defaultRobotId?: string;
  onRobotSelected?: (robotId: string | null) => void;
  overlayLayer: Container;
  viewport: Viewport;
}

export interface DebugOverlayComponent {
  container: Container;
  background: Graphics;
  text: Text;
  lastRenderedText: string;
}

export interface StatusIndicatorComponent {
  indicator: Graphics;
}

export async function createSimulationWorld({
  renderer,
  defaultRobotId = DEFAULT_ROBOT_ID,
  onRobotSelected,
  overlayLayer,
  viewport,
}: CreateSimulationWorldOptions): Promise<SimulationWorldContext> {
  const world = new ECSWorld();
  const blackboard = new ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>();

  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus, 'idle');
  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.SelectedRobotId, null);
  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.TelemetrySnapshot, null);
  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.CurrentUISignal, null);

  const Transform = world.defineComponent<TransformComponent>('Transform');
  const SpriteRef = world.defineComponent<Sprite>('SpriteRef');
  const RobotCore = world.defineComponent<RobotChassis>('RobotCore');
  const ProgramRunner = world.defineComponent<BlockProgramRunner>('ProgramRunner');
  const ViewportTarget = world.defineComponent<ViewportTargetComponent>('ViewportTarget');
  const SelectionState = world.defineComponent<SelectionStateComponent>('SelectionState');
  const RobotId = world.defineComponent<string>('RobotId');
  const DebugOverlay = world.defineComponent<DebugOverlayComponent>('DebugOverlay');
  const StatusIndicator = world.defineComponent<StatusIndicatorComponent>('StatusIndicator');
  const ResourceFieldView = world.defineComponent<ResourceFieldViewComponent>('ResourceFieldView');
  const Selectable = world.defineComponent<SelectableComponent>('Selectable');

  const selectionEntity = world.createEntity();
  SelectionState.set(selectionEntity, { robotId: null });

  const chassisTexture = await assetService.loadTexture('robot/chassis', renderer);

  const robots = new Map<string, EntityId>();

  const applySelection = (robotId: string | null): void => {
    const current = SelectionState.get(selectionEntity)?.robotId ?? null;
    if (current === robotId) {
      return;
    }
    if (robotId !== null && !robots.has(robotId)) {
      return;
    }
    SelectionState.set(selectionEntity, { robotId });
    blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.SelectedRobotId, robotId);
    blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.SelectionChanged, robotId);
    onRobotSelected?.(robotId);
  };

  const createRobotEntity = async (robotId: string) => {
    const entity = world.createEntity();
    robots.set(robotId, entity);
    RobotId.set(entity, robotId);

    const robotCore = new RobotChassis();
    for (const moduleId of DEFAULT_MODULE_LOADOUT) {
      const moduleInstance = createModuleInstance(moduleId);
      robotCore.attachModule(moduleInstance);
    }
    RobotCore.set(entity, robotCore);

    ResourceFieldView.set(entity, {
      resourceField: robotCore.resourceField,
      layer: null,
    });

    const runner = new BlockProgramRunner(robotCore);
    ProgramRunner.set(entity, runner);

    const transform: TransformComponent = {
      position: { x: 0, y: 0 },
      rotation: 0,
    };
    Transform.set(entity, transform);
    ViewportTarget.set(entity, { kind: 'primary', priority: 1 });

    const sprite = new Sprite(chassisTexture);
    sprite.anchor.set(0.5);
    sprite.position.set(transform.position.x, transform.position.y);
    sprite.zIndex = 10;
    SpriteRef.set(entity, sprite);

    const statusIndicator = new Graphics();
    statusIndicator.circle(0, -36, 6);
    statusIndicator.fill({ color: 0xff6b6b, alpha: 0.95 });
    statusIndicator.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.85 });
    statusIndicator.stroke();
    statusIndicator.visible = false;
    sprite.addChild(statusIndicator);
    StatusIndicator.set(entity, { indicator: statusIndicator });

    const debugOverlayContainer = new Container();
    debugOverlayContainer.visible = false;
    debugOverlayContainer.zIndex = 1000;
    debugOverlayContainer.eventMode = 'none';

    const debugOverlayBackground = new Graphics();
    debugOverlayContainer.addChild(debugOverlayBackground);

    const debugOverlayText = new Text({
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
    debugOverlayText.anchor.set(0.5, 0);
    debugOverlayContainer.addChild(debugOverlayText);
    overlayLayer.addChild(debugOverlayContainer);

    DebugOverlay.set(entity, {
      container: debugOverlayContainer,
      background: debugOverlayBackground,
      text: debugOverlayText,
      lastRenderedText: '',
    });

    Selectable.set(entity, {
      id: robotId,
      onSelected: (id) => applySelection(id),
    });

    return { entity, robotCore, runner, sprite };
  };

  const creationOrder: string[] = [];
  if (!creationOrder.includes(defaultRobotId)) {
    creationOrder.push(defaultRobotId);
  }
  for (const robotId of ['MF-01', 'MF-02']) {
    if (!creationOrder.includes(robotId)) {
      creationOrder.push(robotId);
    }
  }

  const robotResults: Array<{
    robotId: string;
    robotCore: RobotChassis;
    runner: BlockProgramRunner;
  }> = [];

  for (const robotId of creationOrder) {
    const { robotCore, runner } = await createRobotEntity(robotId);
    robotResults.push({ robotId, robotCore, runner });
  }

  const defaultRobot = robotResults.find((entry) => entry.robotId === defaultRobotId) ?? robotResults[0];
  const defaultTelemetry: SimulationTelemetrySnapshot = defaultRobot.robotCore.getTelemetrySnapshot();

  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus, defaultRobot.runner.getStatus());
  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.TelemetrySnapshot, defaultTelemetry);
  blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.TelemetryUpdated, defaultTelemetry);

  const selectRobot = (robotId: string | null): void => {
    applySelection(robotId);
  };

  const getSelectedRobot = (): string | null => {
    return SelectionState.get(selectionEntity)?.robotId ?? null;
  };

  const resolveRobotEntity = (robotId?: string): EntityId | null => {
    if (robotId) {
      return robots.get(robotId) ?? null;
    }
    const selected = getSelectedRobot();
    if (selected) {
      return robots.get(selected) ?? null;
    }
    return robots.get(defaultRobot.robotId) ?? null;
  };

  applySelection(defaultRobot.robotId);

  const context: SimulationWorldContext = {
    world,
    components: {
      Transform,
      SpriteRef,
      RobotCore,
      ProgramRunner,
      ViewportTarget,
      SelectionState,
      RobotId,
      DebugOverlay,
      StatusIndicator,
      ResourceFieldView,
      Selectable,
    },
    entities: {
      robots,
      selection: selectionEntity,
    },
    blackboard,
    defaultRobotId: defaultRobot.robotId,
    getRobotCore: (robotId) => {
      const entity = resolveRobotEntity(robotId);
      return entity ? RobotCore.get(entity) ?? null : null;
    },
    getProgramRunner: (robotId) => {
      const entity = resolveRobotEntity(robotId);
      return entity ? ProgramRunner.get(entity) ?? null : null;
    },
    getSprite: (robotId) => {
      const entity = resolveRobotEntity(robotId);
      return entity ? SpriteRef.get(entity) ?? null : null;
    },
    getTransform: (robotId) => {
      const entity = resolveRobotEntity(robotId);
      return entity ? Transform.get(entity) ?? null : null;
    },
    setTransform: (robotId, nextTransform) => {
      const entity = resolveRobotEntity(robotId);
      if (!entity) {
        return;
      }
      Transform.set(entity, nextTransform);
    },
    getRobotId: (entity) => RobotId.get(entity) ?? null,
    getRobotEntity: (robotId) => robots.get(robotId) ?? null,
    selectRobot,
    getSelectedRobot,
  };

  world.addSystem(createProgramRunnerSystem({ ProgramRunner }));
  world.addSystem(createRobotPhysicsSystem({ RobotCore, Transform }));
  world.addSystem(createSpriteSyncSystem({ Transform, SpriteRef }));
  world.addSystem(
    createResourceFieldViewSystem(
      { ResourceFieldView },
      { renderer, container: overlayLayer },
    ),
  );
  world.addSystem(createSelectableSystem({ Selectable, SpriteRef }));
  world.addSystem(
    createStatusIndicatorSystem({ RobotCore, StatusIndicator }, { statusModuleId: STATUS_MODULE_ID }),
  );
  world.addSystem(
    createDebugOverlaySystem(
      { RobotCore, ProgramRunner, SpriteRef, DebugOverlay },
      { overlayLayer, viewport },
    ),
  );

  return context;
}
