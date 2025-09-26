import { Container, Graphics, Sprite, Text, type Renderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { assetService } from '../assetService';
import { ECSWorld, type ComponentHandle, type EntityId } from '../ecs';
import {
  createDebugOverlaySystem,
  createProgramRunnerSystem,
  createResourceFieldViewSystem,
  createMechanismPhysicsSystem,
  createSelectableSystem,
  createSpriteSyncSystem,
  createStatusIndicatorSystem,
} from '../ecs/systems';
import { MechanismChassis } from '../mechanism';
import { DEFAULT_MODULE_LOADOUT, createModuleInstance } from '../mechanism/modules/moduleLibrary';
import { BlockProgramRunner } from './blockProgramRunner';
import { STATUS_MODULE_ID } from '../mechanism/modules/statusModule';
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

export const DEFAULT_MECHANISM_ID = 'MF-01';

export interface TransformComponent {
  position: { x: number; y: number };
  rotation: number;
}

export interface ViewportTargetComponent {
  kind: 'primary';
  priority: number;
}

export interface SelectionStateComponent {
  mechanismId: string | null;
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
  MechanismCore: ComponentHandle<MechanismChassis>;
  ProgramRunner: ComponentHandle<BlockProgramRunner>;
  ViewportTarget: ComponentHandle<ViewportTargetComponent>;
  SelectionState: ComponentHandle<SelectionStateComponent>;
  MechanismId: ComponentHandle<string>;
  DebugOverlay: ComponentHandle<DebugOverlayComponent>;
  StatusIndicator: ComponentHandle<StatusIndicatorComponent>;
  ResourceFieldView: ComponentHandle<ResourceFieldViewComponent>;
  Selectable: ComponentHandle<SelectableComponent>;
}

export interface SimulationWorldEntities {
  mechanisms: Map<string, EntityId>;
  selection: EntityId;
}

export interface SimulationWorldContext {
  world: ECSWorld;
  components: SimulationWorldComponents;
  entities: SimulationWorldEntities;
  blackboard: ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>;
  defaultMechanismId: string;
  getMechanismCore(mechanismId?: string): MechanismChassis | null;
  getProgramRunner(mechanismId?: string): BlockProgramRunner | null;
  getSprite(mechanismId?: string): Sprite | null;
  getTransform(mechanismId?: string): TransformComponent | null;
  setTransform(mechanismId: string, transform: TransformComponent): void;
  getMechanismId(entity: EntityId): string | null;
  getMechanismEntity(mechanismId: string): EntityId | null;
  selectMechanism(mechanismId: string | null): void;
  getSelectedMechanism(): string | null;
}

interface CreateSimulationWorldOptions {
  renderer: Renderer;
  defaultMechanismId?: string;
  onMechanismSelected?: (mechanismId: string | null) => void;
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
  defaultMechanismId = DEFAULT_MECHANISM_ID,
  onMechanismSelected,
  overlayLayer,
  viewport,
}: CreateSimulationWorldOptions): Promise<SimulationWorldContext> {
  const world = new ECSWorld();
  const blackboard = new ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>();

  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus, 'idle');
  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.SelectedMechanismId, null);
  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.TelemetrySnapshot, null);
  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.CurrentUISignal, null);

  const Transform = world.defineComponent<TransformComponent>('Transform');
  const SpriteRef = world.defineComponent<Sprite>('SpriteRef');
  const MechanismCore = world.defineComponent<MechanismChassis>('MechanismCore');
  const ProgramRunner = world.defineComponent<BlockProgramRunner>('ProgramRunner');
  const ViewportTarget = world.defineComponent<ViewportTargetComponent>('ViewportTarget');
  const SelectionState = world.defineComponent<SelectionStateComponent>('SelectionState');
  const MechanismId = world.defineComponent<string>('MechanismId');
  const DebugOverlay = world.defineComponent<DebugOverlayComponent>('DebugOverlay');
  const StatusIndicator = world.defineComponent<StatusIndicatorComponent>('StatusIndicator');
  const ResourceFieldView = world.defineComponent<ResourceFieldViewComponent>('ResourceFieldView');
  const Selectable = world.defineComponent<SelectableComponent>('Selectable');

  const selectionEntity = world.createEntity();
  SelectionState.set(selectionEntity, { mechanismId: null });

  const chassisTexture = await assetService.loadTexture('mechanism/chassis', renderer);

  const mechanisms = new Map<string, EntityId>();

  const applySelection = (mechanismId: string | null): void => {
    const current = SelectionState.get(selectionEntity)?.mechanismId ?? null;
    if (current === mechanismId) {
      return;
    }
    if (mechanismId !== null && !mechanisms.has(mechanismId)) {
      return;
    }
    SelectionState.set(selectionEntity, { mechanismId });
    blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.SelectedMechanismId, mechanismId);
    blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.SelectionChanged, mechanismId);
    onMechanismSelected?.(mechanismId);
  };

  const createMechanismEntity = async (mechanismId: string) => {
    const entity = world.createEntity();
    mechanisms.set(mechanismId, entity);
    MechanismId.set(entity, mechanismId);

    const mechanismCore = new MechanismChassis();
    for (const moduleId of DEFAULT_MODULE_LOADOUT) {
      const moduleInstance = createModuleInstance(moduleId);
      mechanismCore.attachModule(moduleInstance);
    }
    MechanismCore.set(entity, mechanismCore);

    ResourceFieldView.set(entity, {
      resourceField: mechanismCore.resourceField,
      layer: null,
    });

    const runner = new BlockProgramRunner(mechanismCore);
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
      id: mechanismId,
      onSelected: (id) => applySelection(id),
    });

    return { entity, mechanismCore, runner, sprite };
  };

  const creationOrder: string[] = [];
  if (!creationOrder.includes(defaultMechanismId)) {
    creationOrder.push(defaultMechanismId);
  }
  for (const mechanismId of ['MF-01', 'MF-02']) {
    if (!creationOrder.includes(mechanismId)) {
      creationOrder.push(mechanismId);
    }
  }

  const mechanismResults: Array<{
    mechanismId: string;
    mechanismCore: MechanismChassis;
    runner: BlockProgramRunner;
  }> = [];

  for (const mechanismId of creationOrder) {
    const { mechanismCore, runner } = await createMechanismEntity(mechanismId);
    mechanismResults.push({ mechanismId, mechanismCore, runner });
  }

  const defaultMechanism = mechanismResults.find((entry) => entry.mechanismId === defaultMechanismId) ?? mechanismResults[0];
  const defaultTelemetry: SimulationTelemetrySnapshot = defaultMechanism.mechanismCore.getTelemetrySnapshot();

  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus, defaultMechanism.runner.getStatus());
  blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.TelemetrySnapshot, defaultTelemetry);
  blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.TelemetryUpdated, defaultTelemetry);

  const selectMechanism = (mechanismId: string | null): void => {
    applySelection(mechanismId);
  };

  const getSelectedMechanism = (): string | null => {
    return SelectionState.get(selectionEntity)?.mechanismId ?? null;
  };

  const resolveMechanismEntity = (mechanismId?: string): EntityId | null => {
    if (mechanismId) {
      return mechanisms.get(mechanismId) ?? null;
    }
    const selected = getSelectedMechanism();
    if (selected) {
      return mechanisms.get(selected) ?? null;
    }
    return mechanisms.get(defaultMechanism.mechanismId) ?? null;
  };

  applySelection(defaultMechanism.mechanismId);

  const context: SimulationWorldContext = {
    world,
    components: {
      Transform,
      SpriteRef,
      MechanismCore,
      ProgramRunner,
      ViewportTarget,
      SelectionState,
      MechanismId,
      DebugOverlay,
      StatusIndicator,
      ResourceFieldView,
      Selectable,
    },
    entities: {
      mechanisms,
      selection: selectionEntity,
    },
    blackboard,
    defaultMechanismId: defaultMechanism.mechanismId,
    getMechanismCore: (mechanismId) => {
      const entity = resolveMechanismEntity(mechanismId);
      return entity ? MechanismCore.get(entity) ?? null : null;
    },
    getProgramRunner: (mechanismId) => {
      const entity = resolveMechanismEntity(mechanismId);
      return entity ? ProgramRunner.get(entity) ?? null : null;
    },
    getSprite: (mechanismId) => {
      const entity = resolveMechanismEntity(mechanismId);
      return entity ? SpriteRef.get(entity) ?? null : null;
    },
    getTransform: (mechanismId) => {
      const entity = resolveMechanismEntity(mechanismId);
      return entity ? Transform.get(entity) ?? null : null;
    },
    setTransform: (mechanismId, nextTransform) => {
      const entity = resolveMechanismEntity(mechanismId);
      if (!entity) {
        return;
      }
      Transform.set(entity, nextTransform);
    },
    getMechanismId: (entity) => MechanismId.get(entity) ?? null,
    getMechanismEntity: (mechanismId) => mechanisms.get(mechanismId) ?? null,
    selectMechanism,
    getSelectedMechanism,
  };

  world.addSystem(createProgramRunnerSystem({ ProgramRunner }));
  world.addSystem(createMechanismPhysicsSystem({ MechanismCore, Transform }));
  world.addSystem(createSpriteSyncSystem({ Transform, SpriteRef }));
  world.addSystem(
    createResourceFieldViewSystem(
      { ResourceFieldView },
      { renderer, container: overlayLayer },
    ),
  );
  world.addSystem(createSelectableSystem({ Selectable, SpriteRef }));
  world.addSystem(
    createStatusIndicatorSystem({ MechanismCore, StatusIndicator }, { statusModuleId: STATUS_MODULE_ID }),
  );
  world.addSystem(
    createDebugOverlaySystem(
      { MechanismCore, ProgramRunner, SpriteRef, DebugOverlay },
      { overlayLayer, viewport },
    ),
  );

  return context;
}
