import { describe, expect, it, vi } from 'vitest';

import { ECSWorld, Entity } from '../index';

describe('QueryBuilder', () => {
  it('chains filters with component predicates and enabled state handling', () => {
    const world = new ECSWorld();
    const Position = world.defineComponent<{ x: number; y: number }>('Position');
    const Velocity = world.defineComponent<{ x: number; y: number }>('Velocity');
    const Status = world.defineComponent<{ blocked: boolean }>('Status');

    const runner = world.createEntity();
    Position.set(runner, { x: 0, y: 0 });
    Velocity.set(runner, { x: 1, y: 1 });

    const blocked = world.createEntity();
    Position.set(blocked, { x: 5, y: 5 });
    Velocity.set(blocked, { x: 0, y: 0 });
    Status.set(blocked, { blocked: true });

    const idle = world.createEntity();
    Position.set(idle, { x: 3, y: 7 });

    const query = world.query
      .withAll(Position, Velocity)
      .withNone({
        component: Status,
        predicate: (value: unknown, _entity: Entity) => (value as { blocked: boolean }).blocked,
      });

    expect(query.collect()).toEqual([[runner, { x: 0, y: 0 }, { x: 1, y: 1 }]]);

    runner.disable();
    expect(query.collect()).toEqual([]);

    query.anyEnabledState();
    expect(query.collect()).toEqual([[runner, { x: 0, y: 0 }, { x: 1, y: 1 }]]);
  });

  it('supports any/none component filters with predicates', () => {
    const world = new ECSWorld();
    const Buff = world.defineComponent<{ kind: 'heal' | 'shield'; power: number }>('Buff');
    const Debuff = world.defineComponent<{ kind: 'slow' | 'poison'; power: number }>('Debuff');

    const healer = world.createEntity();
    Buff.set(healer, { kind: 'heal', power: 5 });

    const tank = world.createEntity();
    Buff.set(tank, { kind: 'shield', power: 2 });

    const rogue = world.createEntity();
    Debuff.set(rogue, { kind: 'poison', power: 4 });

    const query = world.query
      .withAny(
        {
          component: Buff,
          predicate: (value: unknown, _entity: Entity) =>
            (value as { kind: 'heal' | 'shield'; power: number }).power >= 3,
        },
        {
          component: Debuff,
          predicate: (value: unknown, _entity: Entity) =>
            (value as { kind: 'slow' | 'poison'; power: number }).kind === 'poison',
        },
      )
      .withNone({
        component: Buff,
        predicate: (value: unknown, _entity: Entity) => {
          const typed = value as { kind: 'heal' | 'shield'; power: number };
          return typed.kind === 'shield' && typed.power < 3;
        },
      });

    const resultEntities = [...query.iterate()].map(([entity]) => entity);
    expect(resultEntities).toEqual([healer, rogue]);
  });

  it('filters by relationships and membership groups', () => {
    const world = new ECSWorld();
    const Marker = world.defineComponent<{ name: string }>('Marker');

    const root = world.createEntity();
    Marker.set(root, { name: 'root' });

    const branch = world.createEntity();
    branch.setParent(root);
    Marker.set(branch, { name: 'branch' });

    const leaf = world.createEntity();
    leaf.setParent(branch);
    Marker.set(leaf, { name: 'leaf' });

    const outsiders: Set<Entity> = new Set();
    outsiders.add(leaf);

    const query = world.query
      .withAll(Marker)
      .withParent(branch)
      .withAncestor(root)
      .withinGroup(outsiders)
      .where((entity) => Marker.get(entity)?.name === 'leaf');

    const results = query.collect();
    expect(results).toEqual([[leaf, { name: 'leaf' }]]);
  });

  it('caches results and invalidates when component data changes', () => {
    const world = new ECSWorld();
    const Stat = world.defineComponent<number>('Stat');

    const actor = world.createEntity();
    Stat.set(actor, 1);

    const query = world.query.withAll(Stat);
    const invalidate = vi.fn();
    query.onInvalidate(invalidate);

    expect(query.collect()).toEqual([[actor, 1]]);
    expect(invalidate).not.toHaveBeenCalled();

    expect(query.collect()).toEqual([[actor, 1]]);
    expect(invalidate).not.toHaveBeenCalled();

    Stat.set(actor, 2);
    expect(query.collect()).toEqual([[actor, 2]]);
    expect(invalidate).toHaveBeenCalledTimes(1);

    expect(query.collect()).toEqual([[actor, 2]]);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('invalidates caches on structural changes', () => {
    const world = new ECSWorld();
    const Flag = world.defineComponent<boolean>('Flag');

    const parent = world.createEntity();
    Flag.set(parent, true);

    const child = world.createEntity();
    Flag.set(child, false);
    child.setParent(parent);

    const query = world.query.withAll(Flag).withParent(parent);
    const invalidate = vi.fn();
    query.onInvalidate(invalidate);

    expect(query.collect()).toEqual([[child, false]]);
    expect(invalidate).not.toHaveBeenCalled();

    child.disable();
    expect(query.collect()).toEqual([]);
    expect(invalidate).toHaveBeenCalledTimes(1);

    query.anyEnabledState();
    expect(query.collect()).toEqual([[child, false]]);
    expect(invalidate).toHaveBeenCalledTimes(1);

    child.setParent(null);
    expect(query.collect()).toEqual([]);
    expect(invalidate).toHaveBeenCalledTimes(2);

    world.destroyEntity(child);
    expect(query.collect()).toEqual([]);
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});
