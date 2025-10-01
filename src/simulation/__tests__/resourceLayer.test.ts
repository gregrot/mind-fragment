import { describe, expect, it, vi } from 'vitest';
import type { Renderer } from 'pixi.js';

import { assetService } from '../assetService';
import { ResourceLayer } from '../resourceLayer';
import { ResourceField } from '../resources/resourceField';

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('ResourceLayer', () => {
  it('does not reattach sprites for depleted nodes after pending load resolves', async () => {
    const field = new ResourceField([
      {
        id: 'tree-1',
        type: 'tree',
        position: { x: 0, y: 0 },
        quantity: 1,
      },
    ]);

    const renderer = {} as Renderer;
    const deferred = createDeferred<unknown>();
    const loadSpy = vi
      .spyOn(assetService, 'loadTexture')
      .mockImplementation(() => deferred.promise as Promise<never>);

    const layer = new ResourceLayer(renderer, field);

    expect(loadSpy).toHaveBeenCalledOnce();

    const hitResult = field.registerHit({ nodeId: 'tree-1' });
    expect(hitResult.status).toBe('depleted');

    const container = layer.view as unknown as { children: unknown[] };
    expect(container.children).toHaveLength(0);

    deferred.resolve({});
    await loadSpy.mock.results[0]!.value;
    await Promise.resolve();

    expect(container.children).toHaveLength(0);

    layer.destroy();
    loadSpy.mockRestore();
  });
});
