import { Entity, type EntityHost } from './entity';

export type EntityId = number;

export interface ComponentHandle<TValue> {
  readonly id: symbol;
  readonly name: string;
  get(entity: Entity): TValue | undefined;
  set(entity: Entity, value: TValue): void;
  remove(entity: Entity): void;
  has(entity: Entity): boolean;
  entries(): IterableIterator<[Entity, TValue]>;
}

export type ComponentTuple = readonly ComponentHandle<unknown>[];

type ComponentValueTuple<TComponents extends ComponentTuple> = {
  [Index in keyof TComponents]: TComponents[Index] extends ComponentHandle<infer TValue>
    ? TValue
    : never;
} extends infer Values
  ? Values extends readonly unknown[]
    ? Values
    : never
  : never;

export type QueryResult<TComponents extends ComponentTuple> = [Entity, ...ComponentValueTuple<TComponents>];

export interface System<TComponents extends ComponentTuple = ComponentTuple> {
  readonly name?: string;
  readonly group?: string;
  readonly components: TComponents;
  update(world: ECSWorld, entities: Iterable<QueryResult<TComponents>>, delta: number): void;
}

interface ComponentStore<TValue> extends ComponentHandle<TValue> {
  readonly store: Map<Entity, TValue>;
}

const EMPTY_ENTITY_SET: ReadonlySet<Entity> = new Set();

export class ECSWorld implements EntityHost {
  private nextEntityId = 1 as EntityId;
  readonly entities = new Set<Entity>();
  readonly systemsByGroup = new Map<string, System[]>();

  private readonly entityLookup = new Map<EntityId, Entity>();
  private readonly components = new Map<symbol, ComponentStore<unknown>>();
  private readonly componentIndex = new Map<ComponentHandle<unknown>, Set<Entity>>();
  private readonly componentVersions = new Map<ComponentHandle<unknown>, number>();
  private readonly systems: System[] = [];
  private readonly entitySubscriptions = new Map<Entity, Array<() => void>>();

  createEntity(): Entity {
    const entity = new Entity(this, this.nextEntityId++);
    this.entities.add(entity);
    this.entityLookup.set(entity.id as EntityId, entity);
    this.trackEntity(entity);
    return entity;
  }

  destroyEntity(entity: Entity): void {
    if (!this.entities.delete(entity)) {
      return;
    }

    this.entityLookup.delete(entity.id as EntityId);

    const subscriptions = this.entitySubscriptions.get(entity);
    if (subscriptions) {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
      this.entitySubscriptions.delete(entity);
    }

    if (entity.parent) {
      entity.setParent(null);
    }
    for (const child of [...entity.children]) {
      child.setParent(null);
    }

    for (const component of this.components.values()) {
      if (component.store.has(entity)) {
        this.detachComponent(entity, component);
      }
    }

    entity.markDestroyed();
  }

  hasEntity(entity: Entity): boolean {
    return this.entities.has(entity);
  }

  getEntityById(id: EntityId): Entity | undefined {
    return this.entityLookup.get(id) ?? undefined;
  }

  defineComponent<TValue>(name: string): ComponentHandle<TValue> {
    if (!name.trim()) {
      throw new Error('Component names must be non-empty.');
    }

    const existing = Array.from(this.components.values()).find((component) => component.name === name);
    if (existing) {
      throw new Error(`Component ${name} already defined on this world.`);
    }

    const store = new Map<Entity, TValue>();
    const component: ComponentStore<TValue> = {
      id: Symbol(name),
      name,
      store,
      get: (entity) => {
        this.assertOwnership(entity);
        if (!this.entities.has(entity)) {
          return undefined;
        }
        return store.get(entity);
      },
      set: (entity, value) => {
        this.assertEntityExists(entity);
        this.attachComponent(entity, component, value);
      },
      remove: (entity) => {
        this.assertOwnership(entity);
        if (!this.entities.has(entity)) {
          return;
        }
        this.detachComponent(entity, component);
      },
      has: (entity) => {
        this.assertOwnership(entity);
        return this.entities.has(entity) && store.has(entity);
      },
      entries: () => store.entries(),
    };

    this.components.set(component.id, component as ComponentStore<unknown>);
    this.componentVersions.set(component, 0);
    return component;
  }

  addSystem<TComponents extends ComponentTuple>(system: System<TComponents>): void {
    this.systems.push(system);
    const group = system.group ?? 'default';
    let bucket = this.systemsByGroup.get(group);
    if (!bucket) {
      bucket = [];
      this.systemsByGroup.set(group, bucket);
    }
    bucket.push(system);
  }

  runSystems(delta: number): void {
    for (const system of this.systems) {
      const entities = this.iterateQuery(system.components);
      system.update(this, entities, delta);
    }
  }

  query<TComponents extends ComponentTuple>(...components: TComponents): QueryResult<TComponents>[] {
    return Array.from(this.iterateQuery(components));
  }

  getEntitiesWith(component: ComponentHandle<unknown>): ReadonlySet<Entity> {
    return this.componentIndex.get(component) ?? EMPTY_ENTITY_SET;
  }

  getComponentVersion(component: ComponentHandle<unknown>): number {
    return this.componentVersions.get(component) ?? 0;
  }

  attachComponent<TValue>(entity: Entity, component: ComponentHandle<TValue>, value: TValue): void {
    const store = this.getComponentStore(component);
    const hadPrevious = store.store.has(entity);
    const previous = store.store.get(entity);
    store.store.set(entity, value);
    entity.receiveComponentSet(component, value, previous as TValue | undefined, hadPrevious);
  }

  detachComponent<TValue>(entity: Entity, component: ComponentHandle<TValue>): void {
    const store = this.getComponentStore(component);
    if (!store.store.has(entity)) {
      return;
    }
    const previous = store.store.get(entity) as TValue;
    store.store.delete(entity);
    entity.receiveComponentRemoval(component, previous);
  }

  private *iterateQuery<TComponents extends ComponentTuple>(
    components: TComponents,
  ): IterableIterator<QueryResult<TComponents>> {
    if (components.length === 0) {
      for (const entity of this.entities) {
        if (!entity.enabled) {
          continue;
        }
        yield [entity] as unknown as QueryResult<TComponents>;
      }
      return;
    }

    const [first, ...rest] = components;
    const indexed = this.componentIndex.get(first);

    if (indexed) {
      for (const entity of indexed) {
        if (!this.entities.has(entity) || !entity.enabled) {
          continue;
        }

        const collected: unknown[] = [];

        if (!first.has(entity)) {
          continue;
        }
        collected.push(first.get(entity));

        let missing = false;
        for (const component of rest) {
          if (!component.has(entity)) {
            missing = true;
            break;
          }
          collected.push(component.get(entity));
        }

        if (!missing) {
          yield [entity, ...collected] as unknown as QueryResult<TComponents>;
        }
      }
      return;
    }

    for (const [entity, firstValue] of first.entries()) {
      if (!this.entities.has(entity) || !entity.enabled) {
        continue;
      }

      const collected: unknown[] = [firstValue];
      let missing = false;

      for (const component of rest) {
        if (!component.has(entity)) {
          missing = true;
          break;
        }
        collected.push(component.get(entity));
      }

      if (!missing) {
        yield [entity, ...collected] as unknown as QueryResult<TComponents>;
      }
    }
  }

  private getComponentStore<TValue>(component: ComponentHandle<TValue>): ComponentStore<TValue> {
    const store = this.components.get(component.id) as ComponentStore<TValue> | undefined;
    if (!store) {
      throw new Error('Component does not belong to this world.');
    }
    return store;
  }

  private trackEntity(entity: Entity): void {
    const subscriptions: Array<() => void> = [];

    subscriptions.push(
      entity.componentAdded.connect(({ component }) => {
        if (entity.enabled) {
          this.addToComponentIndex(component, entity);
        }
        this.bumpComponentVersion(component);
      }),
    );

    subscriptions.push(
      entity.componentRemoved.connect(({ component }) => {
        this.removeFromComponentIndex(component, entity);
        this.bumpComponentVersion(component);
      }),
    );

    subscriptions.push(
      entity.componentChanged.connect(({ component }) => {
        this.bumpComponentVersion(component);
      }),
    );

    subscriptions.push(
      entity.enabledChanged.connect(({ enabled }) => {
        for (const { component } of entity.iterateComponents()) {
          if (enabled) {
            this.addToComponentIndex(component, entity);
          } else {
            this.removeFromComponentIndex(component, entity);
          }
          this.bumpComponentVersion(component);
        }
      }),
    );

    this.entitySubscriptions.set(entity, subscriptions);
  }

  private addToComponentIndex(component: ComponentHandle<unknown>, entity: Entity): void {
    if (!entity.enabled) {
      return;
    }
    let index = this.componentIndex.get(component);
    if (!index) {
      index = new Set<Entity>();
      this.componentIndex.set(component, index);
    }
    index.add(entity);
  }

  private removeFromComponentIndex(component: ComponentHandle<unknown>, entity: Entity): void {
    const index = this.componentIndex.get(component);
    if (!index) {
      return;
    }
    index.delete(entity);
    if (index.size === 0) {
      this.componentIndex.delete(component);
    }
  }

  private bumpComponentVersion(component: ComponentHandle<unknown>): void {
    const current = this.componentVersions.get(component) ?? 0;
    this.componentVersions.set(component, current + 1);
  }

  private assertOwnership(entity: Entity): void {
    if (!entity.isOwnedBy(this)) {
      throw new Error('Entity does not belong to this world.');
    }
  }

  private assertEntityExists(entity: Entity): void {
    this.assertOwnership(entity);
    if (!this.entities.has(entity)) {
      throw new Error(`Entity ${entity.id} does not exist in this world.`);
    }
  }
}
