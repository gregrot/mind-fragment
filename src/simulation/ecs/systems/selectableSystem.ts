import type { Sprite } from 'pixi.js';
import type {
  SelectableComponent,
  SimulationWorldComponents,
} from '../../runtime/simulationWorld';
import type { ComponentHandle, System } from '../world';
import type { Entity } from '../entity';

interface SelectableSystemDependencies
  extends Pick<SimulationWorldComponents, 'Selectable' | 'SpriteRef'> {}

type PointerEventName = 'pointerdown' | 'pointertap';

interface ListenerEntry {
  sprite: Sprite;
  handler: () => void;
}

const POINTER_EVENTS: PointerEventName[] = ['pointerdown', 'pointertap'];

const attachListeners = (sprite: Sprite, handler: () => void): void => {
  for (const eventName of POINTER_EVENTS) {
    sprite.on(eventName, handler);
  }
};

const detachListeners = (sprite: Sprite, handler: () => void): void => {
  for (const eventName of POINTER_EVENTS) {
    sprite.off(eventName, handler);
  }
};

export function createSelectableSystem({
  Selectable,
  SpriteRef,
}: SelectableSystemDependencies): System<[
  ComponentHandle<SelectableComponent>,
  ComponentHandle<Sprite>,
]> {
  const listeners = new Map<Entity, ListenerEntry>();

  return {
    name: 'SelectableSystem',
    createQuery: (world) => world.query.withAll(Selectable, SpriteRef),
    update: (world, entities) => {
      const active = new Set<Entity>();

      for (const [entity, _selectable, sprite] of entities) {
        active.add(entity);

        const existing = listeners.get(entity);

        if (existing && existing.sprite !== sprite) {
          detachListeners(existing.sprite, existing.handler);
          listeners.delete(entity);
        }

        let entry = listeners.get(entity);

        if (!entry) {
          const handler = () => {
            const current = Selectable.get(entity);
            if (!current?.onSelected) {
              return;
            }
            current.onSelected(current.id);
          };

          sprite.eventMode = 'static';
          (sprite as { interactive?: boolean }).interactive = true;
          sprite.cursor = 'pointer';

          attachListeners(sprite, handler);
          listeners.set(entity, { sprite, handler });
          entry = listeners.get(entity);
        } else {
          entry.sprite.eventMode = 'static';
          (entry.sprite as { interactive?: boolean }).interactive = true;
          entry.sprite.cursor = 'pointer';
        }
      }

      for (const [entity, entry] of listeners.entries()) {
        if (active.has(entity) && world.hasEntity(entity) && Selectable.has(entity) && SpriteRef.has(entity)) {
          continue;
        }

        detachListeners(entry.sprite, entry.handler);
        listeners.delete(entity);
      }
    },
  };
}
