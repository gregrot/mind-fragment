import { Entity, type EntityHost } from './entity';
import { QueryBuilder, type QueryableWorld } from './queryBuilder';
import { System } from './system';

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

interface ComponentStore<TValue> extends ComponentHandle<TValue> {
  readonly store: Map<Entity, TValue>;
}

const EMPTY_ENTITY_SET: ReadonlySet<Entity> = new Set();

export class ECSWorld implements EntityHost, QueryableWorld {
  private nextEntityId = 1 as EntityId;
  readonly entities = new Set<Entity>();
  readonly systemsByGroup = new Map<string, System[]>();
  private readonly groupOrder: string[] = [];
  private readonly sortedSystemsByGroup = new Map<string, System[]>();
  private readonly dirtyGroups = new Set<string>();
  private readonly systemsByName = new Map<string, System>();
  private readonly systemParents = new Map<System, System>();

  private readonly entityLookup = new Map<EntityId, Entity>();
  private readonly components = new Map<symbol, ComponentStore<unknown>>();
  private readonly componentIndex = new Map<ComponentHandle<unknown>, Set<Entity>>();
  private readonly componentVersions = new Map<ComponentHandle<unknown>, number>();
  private readonly entitySubscriptions = new Map<Entity, Array<() => void>>();
  private readonly queryPool: QueryBuilder<ComponentTuple>[] = [];
  private worldVersion = 0;

  createEntity(): Entity {
    const entity = new Entity(this, this.nextEntityId++);
    this.entities.add(entity);
    this.entityLookup.set(entity.id as EntityId, entity);
    this.trackEntity(entity);
    this.bumpWorldVersion();
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
    this.bumpWorldVersion();
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

  addSystem(system: System): void {
    this.registerSystem(system);
  }

  runSystems(delta: number): void {
    for (const group of this.groupOrder) {
      const systems = this.getSystemsForGroup(group);
      for (const system of systems) {
        this.runSystem(system, delta);
      }
    }
  }

  private registerSystem(system: System, parent?: System): void {
    if (this.systemsByName.has(system.name)) {
      throw new Error(`System with name ${system.name} already registered.`);
    }

    this.systemsByName.set(system.name, system);

    const group = system.group ?? 'default';
    let bucket = this.systemsByGroup.get(group);
    if (!bucket) {
      bucket = [];
      this.systemsByGroup.set(group, bucket);
      this.groupOrder.push(group);
    }
    bucket.push(system);
    this.dirtyGroups.add(group);

    if (parent) {
      this.systemParents.set(system, parent);
    }

    for (const subSystem of system.subSystems) {
      this.registerSystem(subSystem, system);
    }
  }

  private getSystemsForGroup(group: string): readonly System[] {
    if (!this.systemsByGroup.has(group)) {
      return [];
    }

    if (!this.dirtyGroups.has(group)) {
      return this.sortedSystemsByGroup.get(group) ?? [];
    }

    const systems = this.systemsByGroup.get(group) ?? [];
    const sorted = this.sortSystems(group, systems);
    this.sortedSystemsByGroup.set(group, sorted);
    this.dirtyGroups.delete(group);
    return sorted;
  }

  private sortSystems(group: string, systems: System[]): System[] {
    const nodes = [...systems];
    const nodeSet = new Set(nodes);
    const adjacency = new Map<System, Set<System>>();
    const inDegree = new Map<System, number>();

    for (const system of nodes) {
      adjacency.set(system, new Set());
      inDegree.set(system, 0);
    }

    const addEdge = (from: System | undefined, to: System | undefined) => {
      if (!from || !to) {
        return;
      }
      if (!nodeSet.has(from) || !nodeSet.has(to)) {
        return;
      }
      const neighbours = adjacency.get(from)!;
      if (neighbours.has(to)) {
        return;
      }
      neighbours.add(to);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    };

    for (const system of nodes) {
      for (const dependency of system.dependencies) {
        const dependencySystem = this.systemsByName.get(dependency);
        if (!dependencySystem) {
          throw new Error(`Unknown dependency ${dependency} for system ${system.name}.`);
        }
        addEdge(dependencySystem, system);
      }

      for (const after of system.after) {
        const dependencySystem = this.systemsByName.get(after);
        if (!dependencySystem) {
          throw new Error(`Unknown dependency ${after} for system ${system.name}.`);
        }
        addEdge(dependencySystem, system);
      }

      for (const before of system.before) {
        const dependentSystem = this.systemsByName.get(before);
        if (!dependentSystem) {
          throw new Error(`Unknown dependency ${before} for system ${system.name}.`);
        }
        addEdge(system, dependentSystem);
      }

      const parent = this.systemParents.get(system);
      if (parent) {
        addEdge(parent, system);
      }
    }

    const queue: System[] = [];
    for (const system of nodes) {
      if ((inDegree.get(system) ?? 0) === 0) {
        queue.push(system);
      }
    }

    const result: System[] = [];
    while (queue.length > 0) {
      const system = queue.shift()!;
      result.push(system);
      for (const neighbour of adjacency.get(system) ?? []) {
        const updated = (inDegree.get(neighbour) ?? 0) - 1;
        inDegree.set(neighbour, updated);
        if (updated === 0) {
          queue.push(neighbour);
        }
      }
    }

    if (result.length !== nodes.length) {
      throw new Error(`Cyclic dependency detected in system group ${group}.`);
    }

    return result;
  }

  private runSystem(system: System, delta: number): void {
    if (!this.isSystemChainActive(system)) {
      return;
    }

    const builder = system.getQuery(this);
    const results = builder.collect();

    if (results.length === 0 && !system.processEmpty) {
      return;
    }

    if (typeof system.processAll === 'function') {
      system.processAll(this, results, delta);
    } else {
      for (const result of results) {
        system.process(result, delta, this);
      }
    }
  }

  private isSystemChainActive(system: System): boolean {
    if (!system.active || system.paused) {
      return false;
    }

    const parent = this.systemParents.get(system);
    if (!parent) {
      return true;
    }

    return this.isSystemChainActive(parent);
  }

  queryAll<TComponents extends ComponentTuple>(...components: TComponents): QueryResult<TComponents>[] {
    const builder = this.query.withAll(...components);
    const results = builder.collect();
    builder.release();
    return results;
  }

  get query(): QueryBuilder<[]> {
    const builder =
      (this.queryPool.pop() as QueryBuilder<[]> | undefined) ??
      (new QueryBuilder<[]>(this, (returned) => {
        const pooled = returned as QueryBuilder<ComponentTuple>;
        this.queryPool.push(pooled);
      }));
    builder.reset();
    return builder;
  }

  getWorldVersion(): number {
    return this.worldVersion;
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
        this.bumpWorldVersion();
      }),
    );

    subscriptions.push(
      entity.componentRemoved.connect(({ component }) => {
        this.removeFromComponentIndex(component, entity);
        this.bumpComponentVersion(component);
        this.bumpWorldVersion();
      }),
    );

    subscriptions.push(
      entity.componentChanged.connect(({ component }) => {
        this.bumpComponentVersion(component);
        this.bumpWorldVersion();
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
        this.bumpWorldVersion();
      }),
    );

    subscriptions.push(
      entity.parentChanged.connect(() => {
        this.bumpWorldVersion();
      }),
    );

    subscriptions.push(
      entity.childAdded.connect(() => {
        this.bumpWorldVersion();
      }),
    );

    subscriptions.push(
      entity.childRemoved.connect(() => {
        this.bumpWorldVersion();
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

  private bumpWorldVersion(): void {
    this.worldVersion += 1;
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
