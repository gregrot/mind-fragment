import type { Entity } from './entity';
import type { ComponentHandle, ComponentTuple, QueryResult } from './world';

type ComponentValue<THandle extends ComponentHandle<unknown>> = THandle extends ComponentHandle<infer TValue>
  ? TValue
  : never;

export interface ComponentPredicate<THandle extends ComponentHandle<unknown>> {
  component: THandle;
  predicate?: (value: ComponentValue<THandle>, entity: Entity) => boolean;
}

type ComponentConstraint<THandle extends ComponentHandle<unknown>> =
  | THandle
  | ComponentPredicate<THandle>;

type ComponentConstraintTuple<TComponents extends ComponentTuple> = {
  [Index in keyof TComponents]: ComponentConstraint<TComponents[Index]>;
};

type MergeComponentTuples<TExisting extends ComponentTuple, TAdditional extends ComponentTuple> = [...TExisting, ...TAdditional];

interface NormalisedComponentFilter {
  readonly handle: ComponentHandle<unknown>;
  readonly predicate?: (value: unknown, entity: Entity) => boolean;
}

interface QueryCacheSnapshot<TComponents extends ComponentTuple> {
  readonly worldVersion: number;
  readonly componentVersions: Map<ComponentHandle<unknown>, number>;
  readonly results: QueryResult<TComponents>[];
}

export interface QueryableWorld {
  readonly entities: ReadonlySet<Entity>;
  getComponentVersion(component: ComponentHandle<unknown>): number;
  getEntitiesWith(component: ComponentHandle<unknown>): ReadonlySet<Entity>;
  getWorldVersion(): number;
}

function normaliseConstraint<THandle extends ComponentHandle<unknown>>(
  constraint: ComponentConstraint<THandle>,
): NormalisedComponentFilter {
  if (typeof constraint === 'object' && 'component' in constraint) {
    const { component, predicate } = constraint;
    return {
      handle: component,
      predicate: predicate as ((value: unknown, entity: Entity) => boolean) | undefined,
    };
  }

  return { handle: constraint };
}

function collectTrackedComponents(
  required: NormalisedComponentFilter[],
  anyGroups: NormalisedComponentFilter[][],
  excluded: NormalisedComponentFilter[],
): ComponentHandle<unknown>[] {
  const handles = new Map<symbol, ComponentHandle<unknown>>();

  for (const filter of required) {
    handles.set(filter.handle.id, filter.handle);
  }

  for (const group of anyGroups) {
    for (const filter of group) {
      handles.set(filter.handle.id, filter.handle);
    }
  }

  for (const filter of excluded) {
    handles.set(filter.handle.id, filter.handle);
  }

  return [...handles.values()];
}

function entityHasComponent(filter: NormalisedComponentFilter, entity: Entity): boolean {
  if (!filter.handle.has(entity)) {
    return false;
  }
  if (!filter.predicate) {
    return true;
  }
  const value = filter.handle.get(entity);
  return filter.predicate(value, entity);
}

function entityFailsExcluded(filter: NormalisedComponentFilter, entity: Entity): boolean {
  if (!filter.handle.has(entity)) {
    return false;
  }
  if (!filter.predicate) {
    return true;
  }
  const value = filter.handle.get(entity);
  return filter.predicate(value, entity);
}

export class QueryBuilder<TComponents extends ComponentTuple = []> {
  private readonly invalidateListeners = new Set<() => void>();
  private cache: QueryCacheSnapshot<TComponents> | null = null;
  private readonly required: NormalisedComponentFilter[] = [];
  private readonly anyGroups: NormalisedComponentFilter[][] = [];
  private readonly excluded: NormalisedComponentFilter[] = [];
  private readonly selected: ComponentHandle<unknown>[] = [];
  private readonly relationFilters: Array<(entity: Entity) => boolean> = [];
  private readonly groupFilters: Array<(entity: Entity) => boolean> = [];
  private readonly customFilters: Array<(entity: Entity) => boolean> = [];
  private readonly ancestorFilters: Entity[] = [];
  private enabledFilter: boolean | null = true;
  private parentFilter: Entity | null | undefined;

  constructor(
    private readonly world: QueryableWorld,
    private readonly releaseToPool: (builder: QueryBuilder<ComponentTuple>) => void,
  ) {}

  reset(): void {
    this.cache = null;
    this.required.splice(0, this.required.length);
    this.anyGroups.splice(0, this.anyGroups.length);
    this.excluded.splice(0, this.excluded.length);
    this.selected.splice(0, this.selected.length);
    this.relationFilters.splice(0, this.relationFilters.length);
    this.groupFilters.splice(0, this.groupFilters.length);
    this.customFilters.splice(0, this.customFilters.length);
    this.ancestorFilters.splice(0, this.ancestorFilters.length);
    this.enabledFilter = true;
    this.parentFilter = undefined;
    this.invalidateListeners.clear();
  }

  release(): void {
    this.reset();
    this.releaseToPool(this as unknown as QueryBuilder<ComponentTuple>);
  }

  withAll<TAdditional extends ComponentTuple>(
    ...components: ComponentConstraintTuple<TAdditional>
  ): QueryBuilder<MergeComponentTuples<TComponents, TAdditional>> {
    for (const constraint of components) {
      const filter = normaliseConstraint(constraint);
      this.required.push(filter);
      this.selected.push(filter.handle);
    }
    this.cache = null;
    return this as unknown as QueryBuilder<MergeComponentTuples<TComponents, TAdditional>>;
  }

  withAny<TOptional extends ComponentTuple>(
    ...components: ComponentConstraintTuple<TOptional>
  ): this {
    if (components.length === 0) {
      return this;
    }
    const group: NormalisedComponentFilter[] = [];
    for (const constraint of components) {
      group.push(normaliseConstraint(constraint));
    }
    this.anyGroups.push(group);
    this.cache = null;
    return this;
  }

  withNone<TExcluded extends ComponentTuple>(
    ...components: ComponentConstraintTuple<TExcluded>
  ): this {
    for (const constraint of components) {
      this.excluded.push(normaliseConstraint(constraint));
    }
    this.cache = null;
    return this;
  }

  enabled(enabled = true): this {
    this.enabledFilter = enabled;
    this.cache = null;
    return this;
  }

  anyEnabledState(): this {
    this.enabledFilter = null;
    this.cache = null;
    return this;
  }

  withParent(parent: Entity | null): this {
    this.parentFilter = parent;
    this.cache = null;
    return this;
  }

  withAncestor(ancestor: Entity): this {
    this.ancestorFilters.push(ancestor);
    this.cache = null;
    return this;
  }

  withRelation(predicate: (entity: Entity) => boolean): this {
    this.relationFilters.push(predicate);
    this.cache = null;
    return this;
  }

  withinGroup(entities: Iterable<Entity> | ReadonlySet<Entity>): this {
    const collection = entities instanceof Set ? entities : new Set(entities);
    this.groupFilters.push((entity) => collection.has(entity));
    this.cache = null;
    return this;
  }

  where(predicate: (entity: Entity) => boolean): this {
    this.customFilters.push(predicate);
    this.cache = null;
    return this;
  }

  onInvalidate(listener: () => void): () => void {
    this.invalidateListeners.add(listener);
    return () => {
      this.invalidateListeners.delete(listener);
    };
  }

  offInvalidate(listener: () => void): void {
    this.invalidateListeners.delete(listener);
  }

  collect(): QueryResult<TComponents>[] {
    return [...this.ensureCache().results];
  }

  first(): QueryResult<TComponents> | null {
    const cache = this.ensureCache();
    return cache.results.length > 0 ? cache.results[0] : null;
  }

  iterate(): IterableIterator<QueryResult<TComponents>> {
    const cache = this.ensureCache();
    const self = this;
    return (function* iterateResults() {
      for (const result of cache.results) {
        yield result;
      }
      self.cache = cache;
    })();
  }

  forEach(callback: (result: QueryResult<TComponents>) => void): void {
    for (const result of this.iterate()) {
      callback(result);
    }
  }

  private ensureCache(): QueryCacheSnapshot<TComponents> {
    if (!this.cache) {
      this.cache = this.rebuildCache();
      return this.cache;
    }

    if (!this.isCacheCurrent(this.cache)) {
      this.notifyInvalidated();
      this.cache = this.rebuildCache();
    }

    return this.cache;
  }

  private notifyInvalidated(): void {
    for (const listener of [...this.invalidateListeners]) {
      try {
        listener();
      } catch (error) {
        console.error('QueryBuilder invalidate listener failed', error);
      }
    }
  }

  private isCacheCurrent(cache: QueryCacheSnapshot<TComponents>): boolean {
    if (cache.worldVersion !== this.world.getWorldVersion()) {
      return false;
    }

    for (const [component, version] of cache.componentVersions) {
      if (this.world.getComponentVersion(component) !== version) {
        return false;
      }
    }

    return true;
  }

  private rebuildCache(): QueryCacheSnapshot<TComponents> {
    const componentVersions = new Map<ComponentHandle<unknown>, number>();
    const tracked = collectTrackedComponents(this.required, this.anyGroups, this.excluded);
    for (const component of tracked) {
      componentVersions.set(component, this.world.getComponentVersion(component));
    }

    const worldVersion = this.world.getWorldVersion();
    const results = this.computeResults();

    return { worldVersion, componentVersions, results };
  }

  private computeResults(): QueryResult<TComponents>[] {
    const selected = this.selected as unknown as TComponents;
    const results: QueryResult<TComponents>[] = [];

    for (const entity of this.iterateCandidateEntities()) {
      if (!this.matchesEntity(entity)) {
        continue;
      }

      const values: unknown[] = [];
      for (const handle of selected) {
        values.push(handle.get(entity));
      }
      results.push([entity, ...values] as QueryResult<TComponents>);
    }

    return results;
  }

  private *iterateCandidateEntities(): IterableIterator<Entity> {
    if (this.required.length > 0) {
      const candidate = this.selectBestRequiredSource();
      if (candidate) {
        if (candidate.kind === 'index') {
          for (const entity of candidate.entities) {
            yield entity;
          }
          return;
        }

        for (const [entity] of candidate.filter.handle.entries()) {
          yield entity;
        }
        return;
      }
    }

    if (this.anyGroups.length > 0) {
      const [firstGroup] = this.anyGroups;
      const seen = new Set<Entity>();
      for (const filter of firstGroup) {
        const canUseIndex = this.enabledFilter === true;
        const indexed = canUseIndex ? this.world.getEntitiesWith(filter.handle) : undefined;
        if (canUseIndex && indexed && indexed.size > 0) {
          for (const entity of indexed) {
            if (!seen.has(entity)) {
              seen.add(entity);
              yield entity;
            }
          }
          continue;
        }

        for (const [entity] of filter.handle.entries()) {
          if (!seen.has(entity)) {
            seen.add(entity);
            yield entity;
          }
        }
      }

      for (const entity of this.world.entities) {
        if (!seen.has(entity)) {
          yield entity;
        }
      }
      return;
    }

    yield* this.world.entities;
  }

  private selectBestRequiredSource():
    | { kind: 'index'; filter: NormalisedComponentFilter; entities: ReadonlySet<Entity> }
    | { kind: 'scan'; filter: NormalisedComponentFilter }
    | null {
    const canUseIndex = this.enabledFilter === true;

    if (canUseIndex) {
      let bestIndexed: { filter: NormalisedComponentFilter; entities: ReadonlySet<Entity> } | null = null;

      for (const filter of this.required) {
        const indexed = this.world.getEntitiesWith(filter.handle);
        if (indexed.size === 0) {
          continue;
        }
        if (!bestIndexed || indexed.size < bestIndexed.entities.size) {
          bestIndexed = { filter, entities: indexed };
        }
      }

      if (bestIndexed) {
        return { kind: 'index', ...bestIndexed };
      }
    }

    if (this.required.length === 0) {
      return null;
    }

    return { kind: 'scan', filter: this.required[0] };
  }

  private matchesEntity(entity: Entity): boolean {
    if (this.enabledFilter !== null && entity.enabled !== this.enabledFilter) {
      return false;
    }

    if (this.parentFilter !== undefined && entity.parent !== this.parentFilter) {
      return false;
    }

    for (const ancestor of this.ancestorFilters) {
      if (!entity.hasAncestor(ancestor)) {
        return false;
      }
    }

    for (const filter of this.required) {
      if (!entityHasComponent(filter, entity)) {
        return false;
      }
    }

    for (const group of this.anyGroups) {
      let matched = false;
      for (const filter of group) {
        if (entityHasComponent(filter, entity)) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        return false;
      }
    }

    for (const filter of this.excluded) {
      if (entityFailsExcluded(filter, entity)) {
        return false;
      }
    }

    for (const predicate of this.relationFilters) {
      if (!predicate(entity)) {
        return false;
      }
    }

    for (const predicate of this.groupFilters) {
      if (!predicate(entity)) {
        return false;
      }
    }

    for (const predicate of this.customFilters) {
      if (!predicate(entity)) {
        return false;
      }
    }

    return true;
  }
}
