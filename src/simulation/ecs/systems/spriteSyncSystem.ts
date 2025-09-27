import type { Sprite } from 'pixi.js';
import type { SimulationWorldComponents, TransformComponent } from '../../runtime/simulationWorld';
import type { ComponentHandle, System } from '../world';

export function createSpriteSyncSystem({
  Transform,
  SpriteRef,
}: Pick<SimulationWorldComponents, 'Transform' | 'SpriteRef'>): System<[
  ComponentHandle<TransformComponent>,
  ComponentHandle<Sprite>,
]> {
  return {
    name: 'SpriteSyncSystem',
    createQuery: (world) => world.query.withAll(Transform, SpriteRef),
    update: (_world, entities) => {
      for (const [, transform, sprite] of entities) {
        sprite.rotation = transform.rotation;
        sprite.position.set(transform.position.x, transform.position.y);
      }
    },
  };
}
