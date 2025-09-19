import { describe, expect, it } from 'vitest';

import { ECSWorld } from '../world';

describe('ECSWorld', () => {
  it('creates and destroys entities', () => {
    const world = new ECSWorld();
    const first = world.createEntity();
    const second = world.createEntity();

    expect(first).not.toBe(second);
    expect(world.hasEntity(first)).toBe(true);
    expect(world.hasEntity(second)).toBe(true);

    world.destroyEntity(first);

    expect(world.hasEntity(first)).toBe(false);
    expect(world.hasEntity(second)).toBe(true);
  });

  it('manages components for entities', () => {
    const world = new ECSWorld();
    const position = world.defineComponent<{ x: number; y: number }>('position');
    const entity = world.createEntity();

    position.set(entity, { x: 4, y: 9 });

    expect(position.get(entity)).toEqual({ x: 4, y: 9 });

    world.destroyEntity(entity);

    expect(position.has(entity)).toBe(false);
    expect(position.get(entity)).toBeUndefined();

    expect(() => position.set(entity, { x: 0, y: 0 })).toThrowError(
      `Entity ${entity} does not exist in this world.`,
    );
  });

  it('filters query results to matching component sets', () => {
    const world = new ECSWorld();
    const position = world.defineComponent<{ x: number; y: number }>('position');
    const velocity = world.defineComponent<{ x: number; y: number }>('velocity');

    const walker = world.createEntity();
    const statue = world.createEntity();

    position.set(walker, { x: 1, y: 1 });
    velocity.set(walker, { x: 1, y: 0 });
    position.set(statue, { x: 5, y: 5 });

    const positionOnly = world.query(position);
    const moving = world.query(position, velocity);

    expect(positionOnly).toEqual([
      [walker, { x: 1, y: 1 }],
      [statue, { x: 5, y: 5 }],
    ]);
    expect(moving).toEqual([[walker, { x: 1, y: 1 }, { x: 1, y: 0 }]]);
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
      components: [position, velocity],
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
});
