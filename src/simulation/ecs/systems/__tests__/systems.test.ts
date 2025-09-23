import { describe, expect, it, vi } from 'vitest';
import type { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';

import { ECSWorld } from '../../world';
import {
  createDebugOverlaySystem,
  createProgramRunnerSystem,
  createRobotPhysicsSystem,
  createSpriteSyncSystem,
  createStatusIndicatorSystem,
} from '../index';
import {
  BlockProgramRunner,
  type ProgramDebugState,
} from '../../../runtime/blockProgramRunner';
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
      { kind: 'wait', duration: 1 } as BlockInstruction,
      { kind: 'loop', instructions: [{ kind: 'gather', duration: 2, target: 'auto' } as BlockInstruction] } as BlockInstruction,
    ];

    let debugState: ProgramDebugState | null = {
      status: 'running',
      program: { instructions: programInstructions } as CompiledProgram,
      currentInstruction: { kind: 'move', speed: 3, duration: 2 } as BlockInstruction,
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
});
