import type { Sprite } from 'pixi.js';
import type {
  SelectableComponent,
  SimulationWorldComponents,
} from '../../runtime/simulationWorld';
import type { ComponentHandle, QueryResult, ECSWorld } from '../world';
import type { Entity } from '../entity';
import { System } from '../system';

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

class SelectableSystem extends System<[
  ComponentHandle<SelectableComponent>,
  ComponentHandle<Sprite>,
]> {
  private readonly listeners = new Map<Entity, ListenerEntry>();

  constructor(
    private readonly Selectable: ComponentHandle<SelectableComponent>,
    private readonly SpriteRef: ComponentHandle<Sprite>,
  ) {
    super({ name: 'SelectableSystem', processEmpty: true });
  }

  protected override query(world: ECSWorld) {
    return world.query.withAll(this.Selectable, this.SpriteRef);
  }

  override processAll(
    world: ECSWorld,
    entities: QueryResult<[
      ComponentHandle<SelectableComponent>,
      ComponentHandle<Sprite>,
    ]>[],
  ): void {
    const active = new Set<Entity>();

    for (const [entity, _selectable, sprite] of entities) {
      active.add(entity);

      const existing = this.listeners.get(entity);

      if (existing && existing.sprite !== sprite) {
        detachListeners(existing.sprite, existing.handler);
        this.listeners.delete(entity);
      }

      let entry = this.listeners.get(entity);

      if (!entry) {
        const handler = () => {
          const current = this.Selectable.get(entity);
          if (!current?.onSelected) {
            return;
          }
          current.onSelected(current.id);
        };

        sprite.eventMode = 'static';
        (sprite as { interactive?: boolean }).interactive = true;
        sprite.cursor = 'pointer';

        attachListeners(sprite, handler);
        this.listeners.set(entity, { sprite, handler });
        entry = this.listeners.get(entity);
      } else {
        entry.sprite.eventMode = 'static';
        (entry.sprite as { interactive?: boolean }).interactive = true;
        entry.sprite.cursor = 'pointer';
      }
    }

    for (const [entity, entry] of this.listeners.entries()) {
      if (active.has(entity) && world.hasEntity(entity) && this.Selectable.has(entity) && this.SpriteRef.has(entity)) {
        continue;
      }

      detachListeners(entry.sprite, entry.handler);
      this.listeners.delete(entity);
    }
  }
}

export function createSelectableSystem({
  Selectable,
  SpriteRef,
}: SelectableSystemDependencies): SelectableSystem {
  return new SelectableSystem(Selectable, SpriteRef);
}
