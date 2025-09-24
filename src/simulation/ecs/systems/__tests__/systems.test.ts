import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../resourceLayer', () => {
  return {
    ResourceLayer: class ResourceLayerMock {
      public view: { parent: unknown; zIndex: number };
      public dispose = vi.fn();

      constructor() {
        this.view = { parent: null, zIndex: 0 };
      }
    },
  };
});

import type { Container, Graphics, Renderer, Sprite, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { ResourceField } from '../../../resources/resourceField';
import type { ResourceFieldViewComponent, SelectableComponent } from '../../../runtime/simulationWorld';

import { ECSWorld } from '../../world';
import {
  createDebugOverlaySystem,
  createProgramRunnerSystem,
  createResourceFieldViewSystem,
  createRobotPhysicsSystem,
  createSelectableSystem,
  createSpriteSyncSystem,
  createStatusIndicatorSystem,
} from '../index';
import {
  BlockProgramRunner,
  type ProgramDebugState,
} from '../../../runtime/blockProgramRunner';
import { createNumberLiteralBinding } from '../../../runtime/blockProgram';
import { RobotChassis } from '../../../robot';
import { STATUS_MODULE_ID } from '../../../robot/modules/statusModule';
import type {
  DebugOverlayComponent,
  StatusIndicatorComponent,
  TransformComponent,
} from '../../../runtime/simulationWorld';
import {
  DEBUG_CORNER_RADIUS,
  DEBUG_MAX_WIDTH,
  DEBUG_MIN_WIDTH,
  DEBUG_PADDING,
  DEBUG_VERTICAL_OFFSET,
} from '../../../runtime/simulationWorld';
import type { BlockInstruction, CompiledProgram } from '../../../runtime/blockProgram';

const createSpriteStub = (): Sprite => {
  const position = {
    x: 0,
    y: 0,
    set(x: number, y: number) {
      this.x = x;
      this.y = y;
    },
  };

  return {
    rotation: 0,
    position,
  } as unknown as Sprite;
};

const createOverlayLayerStub = (): Container => {
  const layer: { addChild(child: Container): Container } & Record<string, unknown> = {
    addChild(child: Container) {
      (child as unknown as { parent: Container | null }).parent = layer as unknown as Container;
      return child;
    },
  } as Record<string, unknown> as { addChild(child: Container): Container } & Record<string, unknown>;

  return layer as unknown as Container;
};

const createSceneLayerStub = () => {
  const children = new Set<Container>();
  const layer = {
    addChild: vi.fn((child: Container) => {
      children.add(child);
      (child as unknown as { parent: Container | null }).parent = layer as unknown as Container;
      return child;
    }),
    removeChild: vi.fn((child: Container) => {
      children.delete(child);
      (child as unknown as { parent: Container | null }).parent = null;
      return child;
    }),
  };

  return Object.assign(layer as unknown as Container, {
    addChild: layer.addChild,
    removeChild: layer.removeChild,
    __children: children,
  }) as Container & {
    addChild: ReturnType<typeof vi.fn>;
    removeChild: ReturnType<typeof vi.fn>;
    __children: Set<Container>;
  };
};

const createSelectableSpriteStub = () => {
  const handlers = new Map<string, Set<() => void>>();
  const sprite = {
    eventMode: 'auto',
    interactive: false,
    cursor: '',
    on: vi.fn((eventName: string, handler: () => void) => {
      if (!handlers.has(eventName)) {
        handlers.set(eventName, new Set());
      }
      handlers.get(eventName)!.add(handler);
      return sprite;
    }),
    off: vi.fn((eventName: string, handler: () => void) => {
      handlers.get(eventName)?.delete(handler);
      return sprite;
    }),
    trigger(eventName: string) {
      handlers.get(eventName)?.forEach((handler) => handler());
    },
  } as unknown as Sprite & {
    trigger: (eventName: string) => void;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };

  Object.defineProperty(sprite, '__handlers', {
    value: handlers,
  });

  return sprite;
};

const createDebugOverlayComponentStub = () => {
  const containerStub = {
    visible: false,
    destroyed: false,
    parent: null as Container | null,
    position: {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    },
    scale: {
      x: 1,
      y: 1,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    },
  };

  const backgroundStub = {
    clear: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    setStrokeStyle: vi.fn(),
    stroke: vi.fn(),
  };

  const textStub = {
    text: '',
    style: { wordWrap: false, wordWrapWidth: 0 },
    width: 120,
    height: 48,
    anchor: { set: vi.fn() },
    position: {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    },
  };

  const component: DebugOverlayComponent = {
    container: containerStub as unknown as Container,
    background: backgroundStub as unknown as Graphics,
    text: textStub as unknown as Text,
    lastRenderedText: '',
  };

  return { component, containerStub, backgroundStub, textStub };
};

const createValueEntry = (value: unknown, revision = 1) => ({
  value,
  metadata: {},
  revision,
});

const createActionEntry = (revision = 1) => ({
  metadata: {},
  revision,
});

describe('simulation systems', () => {
  it('advances program runners by the provided delta time', () => {
    const world = new ECSWorld();
    const ProgramRunner = world.defineComponent<BlockProgramRunner>('ProgramRunner');
    const entity = world.createEntity();
    const runner = new BlockProgramRunner(new RobotChassis());
    const updateSpy = vi.spyOn(runner, 'update');

    ProgramRunner.set(entity, runner);
    world.addSystem(createProgramRunnerSystem({ ProgramRunner }));

    world.runSystems(0.25);

    expect(updateSpy).toHaveBeenCalledWith(0.25);
  });

  it('ticks robot cores and copies state into the transform component', () => {
    const world = new ECSWorld();
    const Transform = world.defineComponent<TransformComponent>('Transform');
    const RobotCore = world.defineComponent<RobotChassis>('RobotCore');
    const entity = world.createEntity();
    const robot = new RobotChassis();

    robot.state.setLinearVelocity(2, -1);
    robot.state.setAngularVelocity(Math.PI);

    RobotCore.set(entity, robot);
    Transform.set(entity, { position: { x: 0, y: 0 }, rotation: 0 });

    world.addSystem(createRobotPhysicsSystem({ RobotCore, Transform }));
    world.runSystems(0.5);

    const transform = Transform.get(entity);
    expect(transform).toBeDefined();
    expect(transform?.position.x).toBeCloseTo(1);
    expect(transform?.position.y).toBeCloseTo(-0.5);
    expect(transform?.rotation).toBeCloseTo(Math.PI / 2);
  });

  it('applies transform updates to the sprite component', () => {
    const world = new ECSWorld();
    const Transform = world.defineComponent<TransformComponent>('Transform');
    const SpriteRef = world.defineComponent<Sprite>('SpriteRef');
    const entity = world.createEntity();
    const sprite = createSpriteStub();

    Transform.set(entity, {
      position: { x: -3, y: 7 },
      rotation: Math.PI / 3,
    });
    SpriteRef.set(entity, sprite);

    world.addSystem(createSpriteSyncSystem({ Transform, SpriteRef }));
    world.runSystems(1);

    expect(sprite.rotation).toBeCloseTo(Math.PI / 3);
    expect(sprite.position.x).toBeCloseTo(-3);
    expect(sprite.position.y).toBeCloseTo(7);
  });

  it('updates status indicators using telemetry from the status module', () => {
    const world = new ECSWorld();
    const RobotCore = world.defineComponent<RobotChassis>('RobotCore');
    const StatusIndicator = world.defineComponent<StatusIndicatorComponent>('StatusIndicator');
    const entity = world.createEntity();

    const indicatorStub = { visible: false, alpha: 0 } as unknown as Graphics;

    let telemetry: ReturnType<RobotChassis['getTelemetrySnapshot']> = {
      values: {
        [STATUS_MODULE_ID]: {
          active: createValueEntry(true),
        },
      },
      actions: {},
    };

    const getModule = vi.fn<() => unknown>(() => ({}));
    const robotCoreStub = {
      moduleStack: {
        getModule,
      },
      getTelemetrySnapshot: vi.fn(() => telemetry),
    } as unknown as RobotChassis;

    RobotCore.set(entity, robotCoreStub);
    StatusIndicator.set(entity, { indicator: indicatorStub } satisfies StatusIndicatorComponent);

    world.addSystem(
      createStatusIndicatorSystem({ RobotCore, StatusIndicator }, { statusModuleId: STATUS_MODULE_ID }),
    );

    world.runSystems(0);

    expect(indicatorStub.visible).toBe(true);
    expect(indicatorStub.alpha).toBeCloseTo(1);

    telemetry = {
      values: {
        [STATUS_MODULE_ID]: {
          active: createValueEntry(false, 2),
        },
      },
      actions: {},
    };

    world.runSystems(0);

    expect(indicatorStub.visible).toBe(true);
    expect(indicatorStub.alpha).toBeCloseTo(0.2);

    getModule.mockReturnValue(null);
    telemetry = { values: {}, actions: {} };

    world.runSystems(0);

    expect(indicatorStub.visible).toBe(false);
  });

  it('renders debug overlays from program debug state and telemetry', () => {
    const world = new ECSWorld();
    const RobotCore = world.defineComponent<RobotChassis>('RobotCore');
    const ProgramRunner = world.defineComponent<BlockProgramRunner>('ProgramRunner');
    const SpriteRef = world.defineComponent<Sprite>('SpriteRef');
    const DebugOverlay = world.defineComponent<DebugOverlayComponent>('DebugOverlay');
    const entity = world.createEntity();

    const sprite = createSpriteStub();
    sprite.position.set(12, -5);

    const overlayLayer = createOverlayLayerStub();
    const { component: overlayComponent, containerStub, backgroundStub, textStub } =
      createDebugOverlayComponentStub();

    const viewport = { scale: { x: 2, y: 0.5 } } as unknown as Viewport;

    const programInstructions: BlockInstruction[] = [
      {
        kind: 'wait',
        duration: createNumberLiteralBinding(1, { label: 'Debug → wait' }),
      },
      {
        kind: 'loop',
        mode: 'forever',
        instructions: [
          {
            kind: 'gather',
            duration: createNumberLiteralBinding(2, { label: 'Debug → gather' }),
            target: 'auto',
          },
        ],
      },
    ];

    let debugState: ProgramDebugState | null = {
      status: 'running',
      program: { instructions: programInstructions } as CompiledProgram,
      currentInstruction: {
        kind: 'move',
        duration: createNumberLiteralBinding(2, { label: 'Debug → move duration' }),
        speed: createNumberLiteralBinding(3, { label: 'Debug → move speed' }),
      },
      timeRemaining: 1.25,
      frames: [{ kind: 'sequence', index: 0, length: 2 }],
    } satisfies ProgramDebugState;

    let telemetry: ReturnType<RobotChassis['getTelemetrySnapshot']> = {
      values: {
        moduleA: {
          active: createValueEntry(true),
          velocity: createValueEntry(3.14159, 2),
        },
      },
      actions: {
        moduleA: {
          ping: createActionEntry(),
        },
      },
    };

    const robotCoreStub = {
      getTelemetrySnapshot: vi.fn(() => telemetry),
    } as unknown as RobotChassis;

    const programRunnerStub = {
      getDebugState: vi.fn(() => debugState),
    } as unknown as BlockProgramRunner;

    RobotCore.set(entity, robotCoreStub);
    ProgramRunner.set(entity, programRunnerStub);
    SpriteRef.set(entity, sprite);
    DebugOverlay.set(entity, overlayComponent);

    world.addSystem(
      createDebugOverlaySystem(
        { RobotCore, ProgramRunner, SpriteRef, DebugOverlay },
        { overlayLayer, viewport },
      ),
    );

    world.runSystems(0);

    expect(containerStub.visible).toBe(true);
    expect(containerStub.position.x).toBeCloseTo(sprite.position.x);
    expect(containerStub.position.y).toBeCloseTo(sprite.position.y);
    expect(containerStub.scale.x).toBeCloseTo(0.5);
    expect(containerStub.scale.y).toBeCloseTo(2);

    expect(textStub.text).toContain('Program: RUNNING • 3 steps');
    expect(textStub.text).toContain('Current: move');
    expect(textStub.text).toContain('ECS telemetry:');

    const expectedWidth = Math.max(
      Math.min(textStub.width + DEBUG_PADDING * 2, DEBUG_MAX_WIDTH),
      DEBUG_MIN_WIDTH,
    );
    const expectedHeight = textStub.height + DEBUG_PADDING * 2;

    expect(backgroundStub.roundRect).toHaveBeenCalledWith(
      -expectedWidth / 2,
      -DEBUG_VERTICAL_OFFSET - expectedHeight,
      expectedWidth,
      expectedHeight,
      DEBUG_CORNER_RADIUS,
    );
    expect(textStub.style.wordWrapWidth).toBe(DEBUG_MAX_WIDTH - DEBUG_PADDING * 2);

    debugState = null;
    telemetry = { values: {}, actions: {} };

    ProgramRunner.remove(entity);
    world.runSystems(0);

    expect(containerStub.visible).toBe(false);
    expect(overlayComponent.lastRenderedText).toBe('');
  });

  it('creates and disposes resource field layers based on component presence', () => {
    const world = new ECSWorld();
    const ResourceFieldView = world.defineComponent<ResourceFieldViewComponent>('ResourceFieldView');
    const entity = world.createEntity();
    const resourceField = new ResourceField();

    ResourceFieldView.set(entity, { resourceField, layer: null });

    const container = createSceneLayerStub();
    const renderer = {} as Renderer;

    world.addSystem(
      createResourceFieldViewSystem(
        { ResourceFieldView },
        { renderer, container },
      ),
    );

    world.runSystems(0);

    const component = ResourceFieldView.get(entity);
    expect(component?.layer).toBeDefined();
    expect(container.addChild).toHaveBeenCalledTimes(1);
    expect((component?.layer?.view as { parent: unknown }).parent).toBe(container);
    expect((component?.layer?.view as { zIndex: number }).zIndex).toBe(-10);

    world.runSystems(0);
    expect(container.addChild).toHaveBeenCalledTimes(1);

    const layer = component?.layer ?? null;
    expect(layer).toBeTruthy();

    ResourceFieldView.remove(entity);
    world.runSystems(0);

    expect(container.removeChild).toHaveBeenCalledTimes(1);
    expect(layer && 'dispose' in layer && typeof layer.dispose === 'function').toBe(true);
    if (layer && 'dispose' in layer && typeof layer.dispose === 'function') {
      expect(layer.dispose).toHaveBeenCalledTimes(1);
      expect((layer.view as { parent: unknown }).parent).toBeNull();
    }
  });

  it('attaches pointer listeners for selectable sprites', () => {
    const world = new ECSWorld();
    const Selectable = world.defineComponent<SelectableComponent>('Selectable');
    const SpriteRef = world.defineComponent<Sprite>('SpriteRef');
    const entity = world.createEntity();

    const sprite = createSelectableSpriteStub();
    const onSelected = vi.fn();

    Selectable.set(entity, { id: 'bot-01', onSelected });
    SpriteRef.set(entity, sprite);

    world.addSystem(createSelectableSystem({ Selectable, SpriteRef }));

    world.runSystems(0);

    expect(sprite.on).toHaveBeenCalledTimes(2);
    expect(sprite.eventMode).toBe('static');
    expect(sprite.cursor).toBe('pointer');
    expect(sprite.interactive).toBe(true);

    sprite.trigger('pointerdown');
    expect(onSelected).toHaveBeenCalledWith('bot-01');

    world.runSystems(0);
    expect(sprite.on).toHaveBeenCalledTimes(2);
  });

  it('removes pointer listeners when selectable components are removed', () => {
    const world = new ECSWorld();
    const Selectable = world.defineComponent<SelectableComponent>('Selectable');
    const SpriteRef = world.defineComponent<Sprite>('SpriteRef');
    const entity = world.createEntity();

    const sprite = createSelectableSpriteStub();

    Selectable.set(entity, { id: 'bot-02', onSelected: vi.fn() });
    SpriteRef.set(entity, sprite);

    world.addSystem(createSelectableSystem({ Selectable, SpriteRef }));

    world.runSystems(0);
    expect(sprite.on).toHaveBeenCalledTimes(2);

    Selectable.remove(entity);
    world.runSystems(0);

    expect(sprite.off).toHaveBeenCalledTimes(2);
  });
});
