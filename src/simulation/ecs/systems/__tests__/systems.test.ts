import { describe, expect, it, vi } from 'vitest';
import type { Sprite } from 'pixi.js';

import { ECSWorld } from '../../world';
import { createProgramRunnerSystem, createRobotPhysicsSystem, createSpriteSyncSystem } from '../index';
import { BlockProgramRunner } from '../../../runtime/blockProgramRunner';
import { RobotChassis } from '../../../robot';
import type { TransformComponent } from '../../../runtime/simulationWorld';

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
});
