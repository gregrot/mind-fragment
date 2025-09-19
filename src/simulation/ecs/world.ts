export type EntityId = number;

export interface ComponentHandle<TValue> {
  readonly id: symbol;
  readonly name: string;
  get(entity: EntityId): TValue | undefined;
  set(entity: EntityId, value: TValue): void;
  remove(entity: EntityId): void;
  has(entity: EntityId): boolean;
  entries(): IterableIterator<[EntityId, TValue]>;
}

export type ComponentTuple = readonly ComponentHandle<unknown>[];

type ComponentValueTuple<TComponents extends ComponentTuple> = {
  [Index in keyof TComponents]: TComponents[Index] extends ComponentHandle<infer TValue> ? TValue : never;
} extends infer Values
  ? Values extends readonly unknown[]
    ? Values
    : never
  : never;

export type QueryResult<TComponents extends ComponentTuple> = [
  EntityId,
  ...ComponentValueTuple<TComponents>,
];

export interface System<TComponents extends ComponentTuple = ComponentTuple> {
  readonly name?: string;
  readonly components: TComponents;
  update(world: ECSWorld, entities: Iterable<QueryResult<TComponents>>, delta: number): void;
}

interface ComponentStore<TValue> extends ComponentHandle<TValue> {
  readonly store: Map<EntityId, TValue>;
}

export class ECSWorld {
  private nextEntityId = 1 as EntityId;
  private readonly entities = new Set<EntityId>();
  private readonly components = new Map<symbol, ComponentStore<unknown>>();
  private readonly systems: System[] = [];

  createEntity(): EntityId {
    const entity = this.nextEntityId++;
    this.entities.add(entity);
    return entity;
  }

  destroyEntity(entity: EntityId): void {
    if (!this.entities.delete(entity)) {
      return;
    }
    for (const component of this.components.values()) {
      component.remove(entity);
    }
  }

  hasEntity(entity: EntityId): boolean {
    return this.entities.has(entity);
  }

  defineComponent<TValue>(name: string): ComponentHandle<TValue> {
    if (!name.trim()) {
      throw new Error('Component names must be non-empty.');
    }
    const existing = Array.from(this.components.values()).find((component) => component.name === name);
    if (existing) {
      throw new Error(`Component ${name} already defined on this world.`);
    }

    const store = new Map<EntityId, TValue>();
    const component: ComponentStore<TValue> = {
      id: Symbol(name),
      name,
      store,
      get: (entity) => store.get(entity),
      set: (entity, value) => {
        this.assertEntityExists(entity);
        store.set(entity, value);
      },
      remove: (entity) => {
        store.delete(entity);
      },
      has: (entity) => store.has(entity),
      entries: () => store.entries(),
    };

    this.components.set(component.id, component as ComponentStore<unknown>);
    return component;
  }

  addSystem<TComponents extends ComponentTuple>(system: System<TComponents>): void {
    this.systems.push(system);
  }

  runSystems(delta: number): void {
    for (const system of this.systems) {
      const entities = this.iterateQuery(system.components);
      system.update(this, entities, delta);
    }
  }

  query<TComponents extends ComponentTuple>(
    ...components: TComponents
  ): QueryResult<TComponents>[] {
    return Array.from(this.iterateQuery(components));
  }

  private *iterateQuery<TComponents extends ComponentTuple>(
    components: TComponents,
  ): IterableIterator<QueryResult<TComponents>> {
    if (components.length === 0) {
      for (const entity of this.entities) {
        yield [entity] as unknown as QueryResult<TComponents>;
      }
      return;
    }

    const [first, ...rest] = components;

    for (const [entity, firstValue] of first.entries()) {
      if (!this.entities.has(entity)) {
        continue;
      }

      const collected: unknown[] = [firstValue];
      let missing = false;

      for (const component of rest) {
        if (!component.has(entity)) {
          missing = true;
          break;
        }
        collected.push(component.get(entity)!);
      }

      if (!missing) {
        yield [entity, ...collected] as unknown as QueryResult<TComponents>;
      }
    }
  }

  private assertEntityExists(entity: EntityId): void {
    if (!this.entities.has(entity)) {
      throw new Error(`Entity ${entity} does not exist in this world.`);
    }
  }
}
