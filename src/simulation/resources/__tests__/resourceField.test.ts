import { describe, expect, it, vi } from 'vitest';
import {
  ResourceField,
  type ResourceFieldEvent,
  type ResourceNode,
} from '../resourceField';

const origin = { x: 0, y: 0 };

const createField = (nodes: ResourceNode[]): ResourceField => new ResourceField(nodes);

describe('ResourceField subscriptions', () => {
  const baseNode: ResourceNode = {
    id: 'test-node',
    type: 'test-resource',
    position: { x: 0, y: 0 },
    quantity: 10,
  };

  it('notifies listeners when harvesting reduces quantity', () => {
    const field = createField([baseNode]);
    const events: ResourceFieldEvent[] = [];
    field.subscribe((event) => events.push(event));

    const result = field.harvest({ nodeId: baseNode.id, origin, amount: 3, maxDistance: 10 });

    expect(result.status).toBe('ok');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'updated', node: { id: baseNode.id, quantity: 7 } });
  });

  it('notifies depletion when harvesting consumes the final resources', () => {
    const field = createField([baseNode]);
    const events: ResourceFieldEvent[] = [];
    field.subscribe((event) => events.push(event));

    const result = field.harvest({ nodeId: baseNode.id, origin, amount: 15, maxDistance: 10 });

    expect(result.status).toBe('depleted');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'depleted', node: { id: baseNode.id, quantity: 0 } });
  });

  it('emits restored when refilling a depleted node', () => {
    const field = createField([{ ...baseNode, quantity: 0 }]);
    const listener = vi.fn();
    field.subscribe(listener);

    field.restore(baseNode.id, 5);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'restored', node: expect.objectContaining({ id: baseNode.id, quantity: 5 }) }),
    );
  });

  it('stops notifying once a listener unsubscribes', () => {
    const field = createField([baseNode]);
    const listener = vi.fn();
    const unsubscribe = field.subscribe(listener);

    field.harvest({ nodeId: baseNode.id, origin, amount: 2, maxDistance: 10 });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    field.restore(baseNode.id, 2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('ResourceField registerHit', () => {
  const treeNode: ResourceNode = {
    id: 'tree-1',
    type: 'tree',
    position: { x: 12, y: -8 },
    quantity: 3,
    metadata: {
      hitPoints: 3,
      hitsRemaining: 3,
      requiredTool: 'axe',
      drop: { type: 'log', quantity: 2 },
    },
  };

  it('requires the correct tool and drops logs once depleted', () => {
    const field = createField([treeNode]);
    const events: ResourceFieldEvent[] = [];
    field.subscribe((event) => events.push(event));

    const invalidTool = field.registerHit({ nodeId: treeNode.id, toolType: 'pickaxe' });
    expect(invalidTool).toMatchObject({ status: 'invalid-tool', remaining: 3 });
    expect(events).toHaveLength(0);

    const firstHit = field.registerHit({ nodeId: treeNode.id, toolType: 'axe' });
    expect(firstHit).toMatchObject({ status: 'ok', remaining: 2 });
    const secondHit = field.registerHit({ nodeId: treeNode.id, toolType: 'axe' });
    expect(secondHit).toMatchObject({ status: 'ok', remaining: 1 });
    const finalHit = field.registerHit({ nodeId: treeNode.id, toolType: 'axe' });
    expect(finalHit).toMatchObject({ status: 'depleted', remaining: 0 });

    expect(events.map((event) => event.type)).toEqual([
      'updated',
      'updated',
      'depleted',
      'added',
    ]);

    const nodes = field.list();
    const tree = nodes.find((node) => node.id === treeNode.id);
    expect(tree).toBeDefined();
    expect(tree?.quantity).toBe(0);

    const log = nodes.find((node) => node.type === 'log');
    expect(log).toBeDefined();
    expect(log?.quantity).toBe(2);
    expect(log?.position).toEqual(treeNode.position);
  });
});
