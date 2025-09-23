import { Sprite, type Renderer } from 'pixi.js';
import { assetService } from '../assetService';
import { ECSWorld, type ComponentHandle, type EntityId } from '../ecs';
import { RobotChassis } from '../robot';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from '../robot/modules/moduleLibrary';
import { BlockProgramRunner } from './blockProgramRunner';

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

export interface SimulationWorldComponents {
  Transform: ComponentHandle<TransformComponent>;
  SpriteRef: ComponentHandle<Sprite>;
  RobotCore: ComponentHandle<RobotChassis>;
  ProgramRunner: ComponentHandle<BlockProgramRunner>;
  ViewportTarget: ComponentHandle<ViewportTargetComponent>;
  SelectionState: ComponentHandle<SelectionStateComponent>;
  RobotId: ComponentHandle<string>;
}

export interface SimulationWorldEntities {
  robot: EntityId;
  selection: EntityId;
}

export interface SimulationWorldContext {
  world: ECSWorld;
  components: SimulationWorldComponents;
  entities: SimulationWorldEntities;
  getRobotCore(entity?: EntityId): RobotChassis | null;
  getProgramRunner(entity?: EntityId): BlockProgramRunner | null;
  getSprite(entity?: EntityId): Sprite | null;
  getTransform(entity?: EntityId): TransformComponent | null;
  setTransform(entity: EntityId, transform: TransformComponent): void;
  getRobotId(entity: EntityId): string | null;
  getRobotEntity(robotId: string): EntityId | null;
  selectRobot(robotId: string | null): void;
  getSelectedRobot(): string | null;
}

interface CreateSimulationWorldOptions {
  renderer: Renderer;
  defaultRobotId?: string;
  onRobotSelected?: (robotId: string) => void;
}

export async function createSimulationWorld({
  renderer,
  defaultRobotId = DEFAULT_ROBOT_ID,
  onRobotSelected,
}: CreateSimulationWorldOptions): Promise<SimulationWorldContext> {
  const world = new ECSWorld();

  const Transform = world.defineComponent<TransformComponent>('Transform');
  const SpriteRef = world.defineComponent<Sprite>('SpriteRef');
  const RobotCore = world.defineComponent<RobotChassis>('RobotCore');
  const ProgramRunner = world.defineComponent<BlockProgramRunner>('ProgramRunner');
  const ViewportTarget = world.defineComponent<ViewportTargetComponent>('ViewportTarget');
  const SelectionState = world.defineComponent<SelectionStateComponent>('SelectionState');
  const RobotId = world.defineComponent<string>('RobotId');

  const selectionEntity = world.createEntity();
  SelectionState.set(selectionEntity, { robotId: null });

  const robotEntity = world.createEntity();
  RobotId.set(robotEntity, defaultRobotId);

  const robotCore = new RobotChassis();
  for (const moduleId of DEFAULT_MODULE_LOADOUT) {
    const moduleInstance = createModuleInstance(moduleId);
    robotCore.attachModule(moduleInstance);
  }
  RobotCore.set(robotEntity, robotCore);

  const runner = new BlockProgramRunner(robotCore);
  ProgramRunner.set(robotEntity, runner);

  const transform: TransformComponent = {
    position: { x: 0, y: 0 },
    rotation: 0,
  };
  Transform.set(robotEntity, transform);
  ViewportTarget.set(robotEntity, { kind: 'primary', priority: 1 });

  const texture = await assetService.loadTexture('robot/chassis', renderer);
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.position.set(transform.position.x, transform.position.y);
  sprite.eventMode = 'static';
  sprite.interactive = true;
  sprite.cursor = 'pointer';
  sprite.zIndex = 10;
  sprite.on('pointerdown', () => onRobotSelected?.(defaultRobotId));
  sprite.on('pointertap', () => onRobotSelected?.(defaultRobotId));
  SpriteRef.set(robotEntity, sprite);

  const selectRobot = (robotId: string | null): void => {
    SelectionState.set(selectionEntity, { robotId });
  };

  const getSelectedRobot = (): string | null => {
    return SelectionState.get(selectionEntity)?.robotId ?? null;
  };

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
    },
    entities: {
      robot: robotEntity,
      selection: selectionEntity,
    },
    getRobotCore: (entity = robotEntity) => RobotCore.get(entity) ?? null,
    getProgramRunner: (entity = robotEntity) => ProgramRunner.get(entity) ?? null,
    getSprite: (entity = robotEntity) => SpriteRef.get(entity) ?? null,
    getTransform: (entity = robotEntity) => Transform.get(entity) ?? null,
    setTransform: (entity, nextTransform) => {
      Transform.set(entity, nextTransform);
    },
    getRobotId: (entity) => RobotId.get(entity) ?? null,
    getRobotEntity: (robotId) => {
      for (const [entity, id] of RobotId.entries()) {
        if (id === robotId) {
          return entity;
        }
      }
      return null;
    },
    selectRobot,
    getSelectedRobot,
  };

  return context;
}
