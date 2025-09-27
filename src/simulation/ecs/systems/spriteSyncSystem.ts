import type { Sprite } from 'pixi.js';
import type { SimulationWorldComponents, TransformComponent } from '../../runtime/simulationWorld';
import type { ComponentHandle, QueryResult, ECSWorld } from '../world';
import { System } from '../system';

class SpriteSyncSystem extends System<[
  ComponentHandle<TransformComponent>,
  ComponentHandle<Sprite>,
]> {
  constructor(
    private readonly Transform: ComponentHandle<TransformComponent>,
    private readonly SpriteRef: ComponentHandle<Sprite>,
  ) {
    super({ name: 'SpriteSyncSystem' });
  }

  protected override query(world: ECSWorld) {
    return world.query.withAll(this.Transform, this.SpriteRef);
  }

  override process(
    [
      ,
      transform,
      sprite,
    ]: QueryResult<[
      ComponentHandle<TransformComponent>,
      ComponentHandle<Sprite>,
    ]>,
    _delta: number,
    _world: ECSWorld,
  ): void {
    sprite.rotation = transform.rotation;
    sprite.position.set(transform.position.x, transform.position.y);
  }
}

export function createSpriteSyncSystem({
  Transform,
  SpriteRef,
}: Pick<SimulationWorldComponents, 'Transform' | 'SpriteRef'>): SpriteSyncSystem {
  return new SpriteSyncSystem(Transform, SpriteRef);
}
