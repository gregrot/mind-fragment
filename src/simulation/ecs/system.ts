import { QueryBuilder } from './queryBuilder';
import type { ECSWorld, ComponentTuple, QueryResult } from './world';

export interface SystemOptions {
  readonly name?: string;
  readonly group?: string;
  readonly active?: boolean;
  readonly paused?: boolean;
  readonly processEmpty?: boolean;
  readonly parallelProcessing?: boolean;
  readonly dependencies?: Iterable<string>;
  readonly before?: Iterable<string>;
  readonly after?: Iterable<string>;
  readonly subSystems?: Iterable<System>;
}

export class System<TComponents extends ComponentTuple = ComponentTuple> {
  readonly name: string;
  readonly group: string;
  active: boolean;
  paused: boolean;
  processEmpty: boolean;
  parallelProcessing: boolean;
  readonly dependencies: Set<string>;
  readonly before: Set<string>;
  readonly after: Set<string>;
  readonly subSystems: readonly System[];

  private readonly queryCache = new WeakMap<ECSWorld, QueryBuilder<TComponents>>();

  constructor(options: SystemOptions = {}) {
    this.name = options.name ?? this.constructor.name ?? 'System';
    this.group = options.group ?? 'default';
    this.active = options.active ?? true;
    this.paused = options.paused ?? false;
    this.processEmpty = options.processEmpty ?? false;
    this.parallelProcessing = options.parallelProcessing ?? false;
    this.dependencies = new Set(options.dependencies ?? []);
    this.before = new Set(options.before ?? []);
    this.after = new Set(options.after ?? []);
    this.subSystems = options.subSystems ? [...options.subSystems] : [];
  }

  protected query(world: ECSWorld): QueryBuilder<TComponents> {
    return world.query as unknown as QueryBuilder<TComponents>;
  }

  getQuery(world: ECSWorld): QueryBuilder<TComponents> {
    let builder = this.queryCache.get(world);
    if (!builder) {
      builder = this.query(world);
      this.queryCache.set(world, builder);
    }
    return builder;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  process(_entity: QueryResult<TComponents>, _delta: number, _world: ECSWorld): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  processAll?(_world: ECSWorld, _entities: QueryResult<TComponents>[], _delta: number): void;
}
