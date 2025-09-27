import { describe, expect, it, vi } from 'vitest';

import { ECSWorld, Entity } from '../index';

describe('ECSWorld', () => {
  it('creates and destroys entities', () => {
    const world = new ECSWorld();
    const first = world.createEntity();
    const second = world.createEntity();

    expect(first).toBeInstanceOf(Entity);
    expect(second).toBeInstanceOf(Entity);
    expect(first).not.toBe(second);
    expect(first.id).not.toBe(second.id);

    expect(world.hasEntity(first)).toBe(true);
    expect(world.hasEntity(second)).toBe(true);
    expect(world.getEntityById(first.id)).toBe(first);

    world.destroyEntity(first);

    expect(world.hasEntity(first)).toBe(false);
    expect(first.isDestroyed).toBe(true);
    expect(world.hasEntity(second)).toBe(true);
    expect(world.getEntityById(first.id)).toBeUndefined();
  });

  it('manages components and entity helpers', () => {
    const world = new ECSWorld();
    const stats = world.defineComponent<number>('stats');
    const entity = world.createEntity();

    entity.addComponent(stats, 5);
    expect(stats.get(entity)).toBe(5);

    entity.setComponent(stats, 8);
    expect(stats.get(entity)).toBe(8);

    stats.remove(entity);
    expect(stats.has(entity)).toBe(false);

    world.destroyEntity(entity);
    expect(() => stats.set(entity, 1)).toThrowError(
      `Entity ${entity.id} does not exist in this world.`,
    );
  });

  it('emits component lifecycle events and tracks component versions', () => {
    const world = new ECSWorld();
    const counter = world.defineComponent<number>('counter');
    const entity = world.createEntity();

    const added = vi.fn();
    const changed = vi.fn();
    const removed = vi.fn();

    entity.componentAdded.connect(({ value }) => added(value));
    entity.componentChanged.connect(({ previous, value }) => changed(previous, value));
    entity.componentRemoved.connect(({ previous }) => removed(previous));

    counter.set(entity, 1);
    expect(added).toHaveBeenCalledWith(1);
    expect(world.getComponentVersion(counter)).toBe(1);

    counter.set(entity, 3);
    expect(changed).toHaveBeenCalledWith(1, 3);
    expect(world.getComponentVersion(counter)).toBe(2);

    counter.remove(entity);
    expect(removed).toHaveBeenCalledWith(3);
    expect(world.getComponentVersion(counter)).toBe(3);
  });

  it('filters query results to matching component sets and respects enable state', () => {
    const world = new ECSWorld();
    const position = world.defineComponent<{ x: number; y: number }>('position');
    const velocity = world.defineComponent<{ x: number; y: number }>('velocity');

    const walker = world.createEntity();
    const statue = world.createEntity();

    position.set(walker, { x: 1, y: 1 });
    velocity.set(walker, { x: 1, y: 0 });
    position.set(statue, { x: 5, y: 5 });

    expect(world.queryAll(position)).toEqual([
      [walker, { x: 1, y: 1 }],
      [statue, { x: 5, y: 5 }],
    ]);
    expect(world.queryAll(position, velocity)).toEqual([[walker, { x: 1, y: 1 }, { x: 1, y: 0 }]]);

    walker.disable();
    expect(world.queryAll(position, velocity)).toEqual([]);

    walker.enable();
    expect(world.queryAll(position, velocity)).toEqual([[walker, { x: 1, y: 1 }, { x: 1, y: 0 }]]);
  });

  it('runs systems against matching entities', () => {
    const world = new ECSWorld();
    const position = world.defineComponent<{ x: number; y: number }>('position');
    const velocity = world.defineComponent<{ x: number; y: number }>('velocity');

    const mover = world.createEntity();
    const parked = world.createEntity();

    position.set(mover, { x: 0, y: 0 });
    velocity.set(mover, { x: 2, y: -1 });
    position.set(parked, { x: 10, y: 10 });

    world.addSystem({
      name: 'movement',
      createQuery: (lookup) => lookup.query.withAll(position, velocity),
      update: (_, entities, delta) => {
        for (const [entity, pos, vel] of entities) {
          position.set(entity, {
            x: pos.x + vel.x * delta,
            y: pos.y + vel.y * delta,
          });
        }
      },
    });

    world.runSystems(0.5);

    expect(position.get(mover)).toEqual({ x: 1, y: -0.5 });
    expect(position.get(parked)).toEqual({ x: 10, y: 10 });
  });

  it('maintains parent and child relationships', () => {
    const world = new ECSWorld();
    const parent = world.createEntity();
    const child = world.createEntity();

    const parentChanged = vi.fn();
    const childAdded = vi.fn();
    const childRemoved = vi.fn();

    child.parentChanged.connect(({ previous, next }) => parentChanged(previous, next));
    parent.childAdded.connect(({ child: nextChild }) => childAdded(nextChild));
    parent.childRemoved.connect(({ child: removedChild }) => childRemoved(removedChild));

    child.setParent(parent);
    expect(child.parent).toBe(parent);
    expect(parent.children.has(child)).toBe(true);
    expect(parentChanged).toHaveBeenLastCalledWith(null, parent);
    expect(childAdded).toHaveBeenCalledWith(child);

    expect(() => parent.setParent(child)).toThrowError('Cannot parent an entity to its descendant.');
    expect(() => parent.setParent(parent)).toThrowError('An entity cannot be its own parent.');

    child.setParent(null);
    expect(child.parent).toBeNull();
    expect(parent.children.has(child)).toBe(false);
    expect(parentChanged).toHaveBeenLastCalledWith(parent, null);
    expect(childRemoved).toHaveBeenCalledWith(child);

    expect(() => child.setParent(child)).toThrowError('An entity cannot be its own parent.');
  });
});
