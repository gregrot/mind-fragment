import { describe, it, expect, beforeEach } from 'vitest';
import { Interpreter } from '../../src/Interpreter';
import { BlockRegistry } from '../../src/BlockRegistry';
import type { GraphData, BlockSpec } from '../../src/types';

describe('Interpreter', () => {
  let registry: BlockRegistry;
  let interpreter: Interpreter;

  beforeEach(() => {
    registry = new BlockRegistry();
    interpreter = new Interpreter(registry);
  });

  describe('topological sorting', () => {
    it('should execute nodes in correct order for linear chain', async () => {
      // Register test blocks
      registry.register({
        kind: 'source',
        label: 'Source',
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: () => ({ out: 10 })
      });

      registry.register({
        kind: 'transform',
        label: 'Transform',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: ({ inputs }) => ({ out: (inputs.in as number) * 2 })
      });

      registry.register({
        kind: 'sink',
        label: 'Sink',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'result', type: 'number' }],
        evaluate: ({ inputs }) => ({ result: (inputs.in as number) + 1 })
      });

      const graph: GraphData = {
        nodes: [
          { id: 'node1', kind: 'source', x: 0, y: 0 },
          { id: 'node2', kind: 'transform', x: 100, y: 0 },
          { id: 'node3', kind: 'sink', x: 200, y: 0 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'node1', portKey: 'out' },
            to: { nodeId: 'node2', portKey: 'in' }
          },
          {
            id: 'link2',
            from: { nodeId: 'node2', portKey: 'out' },
            to: { nodeId: 'node3', portKey: 'in' }
          }
        ]
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('node1')).toEqual({ out: 10 });
      expect(result.values.get('node2')).toEqual({ out: 20 });
      expect(result.values.get('node3')).toEqual({ result: 21 });
    });

    it('should handle parallel execution paths', async () => {
      registry.register({
        kind: 'source',
        label: 'Source',
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: () => ({ out: 5 })
      });

      registry.register({
        kind: 'double',
        label: 'Double',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: ({ inputs }) => ({ out: (inputs.in as number) * 2 })
      });

      registry.register({
        kind: 'triple',
        label: 'Triple',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: ({ inputs }) => ({ out: (inputs.in as number) * 3 })
      });

      registry.register({
        kind: 'add',
        label: 'Add',
        inputs: [
          { key: 'a', type: 'number' },
          { key: 'b', type: 'number' }
        ],
        outputs: [{ key: 'sum', type: 'number' }],
        evaluate: ({ inputs }) => ({ sum: (inputs.a as number) + (inputs.b as number) })
      });

      const graph: GraphData = {
        nodes: [
          { id: 'source', kind: 'source', x: 0, y: 0 },
          { id: 'double', kind: 'double', x: 100, y: -50 },
          { id: 'triple', kind: 'triple', x: 100, y: 50 },
          { id: 'add', kind: 'add', x: 200, y: 0 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'source', portKey: 'out' },
            to: { nodeId: 'double', portKey: 'in' }
          },
          {
            id: 'link2',
            from: { nodeId: 'source', portKey: 'out' },
            to: { nodeId: 'triple', portKey: 'in' }
          },
          {
            id: 'link3',
            from: { nodeId: 'double', portKey: 'out' },
            to: { nodeId: 'add', portKey: 'a' }
          },
          {
            id: 'link4',
            from: { nodeId: 'triple', portKey: 'out' },
            to: { nodeId: 'add', portKey: 'b' }
          }
        ]
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('source')).toEqual({ out: 5 });
      expect(result.values.get('double')).toEqual({ out: 10 });
      expect(result.values.get('triple')).toEqual({ out: 15 });
      expect(result.values.get('add')).toEqual({ sum: 25 });
    });

    it('should handle nodes with no dependencies first', async () => {
      registry.register({
        kind: 'independent',
        label: 'Independent',
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: () => ({ out: 42 })
      });

      registry.register({
        kind: 'dependent',
        label: 'Dependent',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: ({ inputs }) => ({ out: inputs.in as number })
      });

      const graph: GraphData = {
        nodes: [
          { id: 'dep', kind: 'dependent', x: 100, y: 0 },
          { id: 'indep1', kind: 'independent', x: 0, y: 0 },
          { id: 'indep2', kind: 'independent', x: 0, y: 100 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'indep1', portKey: 'out' },
            to: { nodeId: 'dep', portKey: 'in' }
          }
        ]
      };

      const result = await interpreter.run(graph);

      // All nodes should execute successfully
      expect(result.values.get('indep1')).toEqual({ out: 42 });
      expect(result.values.get('indep2')).toEqual({ out: 42 });
      expect(result.values.get('dep')).toEqual({ out: 42 });
    });
  });

  describe('execution order validation', () => {
    it('should detect and throw error for circular dependencies', async () => {
      registry.register({
        kind: 'passthrough',
        label: 'Passthrough',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: ({ inputs }) => ({ out: inputs.in })
      });

      const circularGraph: GraphData = {
        nodes: [
          { id: 'node1', kind: 'passthrough', x: 0, y: 0 },
          { id: 'node2', kind: 'passthrough', x: 100, y: 0 },
          { id: 'node3', kind: 'passthrough', x: 200, y: 0 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'node1', portKey: 'out' },
            to: { nodeId: 'node2', portKey: 'in' }
          },
          {
            id: 'link2',
            from: { nodeId: 'node2', portKey: 'out' },
            to: { nodeId: 'node3', portKey: 'in' }
          },
          {
            id: 'link3',
            from: { nodeId: 'node3', portKey: 'out' },
            to: { nodeId: 'node1', portKey: 'in' }
          }
        ]
      };

      await expect(interpreter.run(circularGraph)).rejects.toThrow('Graph contains a cycle');
    });

    it('should handle self-referencing nodes', async () => {
      registry.register({
        kind: 'self-ref',
        label: 'Self Reference',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: ({ inputs }) => ({ out: inputs.in })
      });

      const selfRefGraph: GraphData = {
        nodes: [
          { id: 'node1', kind: 'self-ref', x: 0, y: 0 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'node1', portKey: 'out' },
            to: { nodeId: 'node1', portKey: 'in' }
          }
        ]
      };

      await expect(interpreter.run(selfRefGraph)).rejects.toThrow('Graph contains a cycle');
    });
  });

  describe('input resolution', () => {
    beforeEach(() => {
      registry.register({
        kind: 'source',
        label: 'Source',
        outputs: [
          { key: 'out1', type: 'number' },
          { key: 'out2', type: 'string' }
        ],
        evaluate: () => ({ out1: 10, out2: 'hello' })
      });

      registry.register({
        kind: 'multi-input',
        label: 'Multi Input',
        inputs: [
          { key: 'num', type: 'number' },
          { key: 'str', type: 'string' },
          { key: 'optional', type: 'number' }
        ],
        outputs: [{ key: 'result', type: 'string' }],
        evaluate: ({ inputs }) => ({
          result: `${inputs.num}-${inputs.str}-${inputs.optional || 'none'}`
        })
      });
    });

    it('should resolve inputs from connected nodes', async () => {
      const graph: GraphData = {
        nodes: [
          { id: 'source', kind: 'source', x: 0, y: 0 },
          { id: 'consumer', kind: 'multi-input', x: 100, y: 0 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'source', portKey: 'out1' },
            to: { nodeId: 'consumer', portKey: 'num' }
          },
          {
            id: 'link2',
            from: { nodeId: 'source', portKey: 'out2' },
            to: { nodeId: 'consumer', portKey: 'str' }
          }
        ]
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('consumer')).toEqual({
        result: '10-hello-none'
      });
    });

    it('should handle missing inputs gracefully', async () => {
      const graph: GraphData = {
        nodes: [
          { id: 'consumer', kind: 'multi-input', x: 0, y: 0 }
        ],
        links: []
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('consumer')).toEqual({
        result: 'undefined-undefined-none'
      });
    });

    it('should handle multiple inputs from same source', async () => {
      registry.register({
        kind: 'duplicator',
        label: 'Duplicator',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'result', type: 'number' }],
        evaluate: ({ inputs }) => ({
          result: (inputs.in as number) + (inputs.in as number)
        })
      });

      const graph: GraphData = {
        nodes: [
          { id: 'source', kind: 'source', x: 0, y: 0 },
          { id: 'dup1', kind: 'duplicator', x: 100, y: -50 },
          { id: 'dup2', kind: 'duplicator', x: 100, y: 50 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'source', portKey: 'out1' },
            to: { nodeId: 'dup1', portKey: 'in' }
          },
          {
            id: 'link2',
            from: { nodeId: 'source', portKey: 'out1' },
            to: { nodeId: 'dup2', portKey: 'in' }
          }
        ]
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('dup1')).toEqual({ result: 20 });
      expect(result.values.get('dup2')).toEqual({ result: 20 });
    });
  });

  describe('error handling', () => {
    it('should throw error for missing block specification', async () => {
      const graph: GraphData = {
        nodes: [
          { id: 'unknown', kind: 'non.existent', x: 0, y: 0 }
        ],
        links: []
      };

      await expect(interpreter.run(graph)).rejects.toThrow('Unknown block: non.existent');
    });

    it('should handle blocks without evaluate function', async () => {
      registry.register({
        kind: 'no-eval',
        label: 'No Evaluate',
        outputs: [{ key: 'out', type: 'number' }]
        // No evaluate function
      });

      const graph: GraphData = {
        nodes: [
          { id: 'node1', kind: 'no-eval', x: 0, y: 0 }
        ],
        links: []
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('node1')).toEqual({});
    });

    it('should handle evaluation errors gracefully', async () => {
      registry.register({
        kind: 'error-block',
        label: 'Error Block',
        evaluate: () => {
          throw new Error('Evaluation failed');
        }
      });

      const graph: GraphData = {
        nodes: [
          { id: 'error', kind: 'error-block', x: 0, y: 0 }
        ],
        links: []
      };

      await expect(interpreter.run(graph)).rejects.toThrow('Evaluation failed');
    });
  });

  describe('async execution support', () => {
    it('should handle async block evaluation', async () => {
      registry.register({
        kind: 'async-block',
        label: 'Async Block',
        outputs: [{ key: 'result', type: 'number' }],
        evaluate: async () => {
          // Simulate async operation with Promise.resolve
          return Promise.resolve({ result: 42 });
        }
      });

      registry.register({
        kind: 'sync-consumer',
        label: 'Sync Consumer',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: ({ inputs }) => ({ out: (inputs.in as number) * 2 })
      });

      const graph: GraphData = {
        nodes: [
          { id: 'async', kind: 'async-block', x: 0, y: 0 },
          { id: 'sync', kind: 'sync-consumer', x: 100, y: 0 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'async', portKey: 'result' },
            to: { nodeId: 'sync', portKey: 'in' }
          }
        ]
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('async')).toEqual({ result: 42 });
      expect(result.values.get('sync')).toEqual({ out: 84 });
    });

    it('should handle mixed async and sync blocks', async () => {
      registry.register({
        kind: 'async-source',
        label: 'Async Source',
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: async () => Promise.resolve({ out: 10 })
      });

      registry.register({
        kind: 'sync-transform',
        label: 'Sync Transform',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: ({ inputs }) => ({ out: (inputs.in as number) + 5 })
      });

      registry.register({
        kind: 'async-sink',
        label: 'Async Sink',
        inputs: [{ key: 'in', type: 'number' }],
        outputs: [{ key: 'result', type: 'number' }],
        evaluate: async ({ inputs }) => Promise.resolve({ result: (inputs.in as number) * 2 })
      });

      const graph: GraphData = {
        nodes: [
          { id: 'source', kind: 'async-source', x: 0, y: 0 },
          { id: 'transform', kind: 'sync-transform', x: 100, y: 0 },
          { id: 'sink', kind: 'async-sink', x: 200, y: 0 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'source', portKey: 'out' },
            to: { nodeId: 'transform', portKey: 'in' }
          },
          {
            id: 'link2',
            from: { nodeId: 'transform', portKey: 'out' },
            to: { nodeId: 'sink', portKey: 'in' }
          }
        ]
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('source')).toEqual({ out: 10 });
      expect(result.values.get('transform')).toEqual({ out: 15 });
      expect(result.values.get('sink')).toEqual({ result: 30 });
    });
  });

  describe('configuration handling', () => {
    it('should pass node configuration to evaluate function', async () => {
      registry.register({
        kind: 'configurable',
        label: 'Configurable',
        outputs: [{ key: 'result', type: 'number' }],
        evaluate: ({ config }) => ({
          result: (config as any)?.multiplier ? (config as any).multiplier * 10 : 0
        })
      });

      const graph: GraphData = {
        nodes: [
          {
            id: 'configured',
            kind: 'configurable',
            x: 0,
            y: 0,
            config: { multiplier: 5 }
          },
          {
            id: 'unconfigured',
            kind: 'configurable',
            x: 100,
            y: 0
          }
        ],
        links: []
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('configured')).toEqual({ result: 50 });
      expect(result.values.get('unconfigured')).toEqual({ result: 0 });
    });
  });

  describe('empty graph handling', () => {
    it('should handle empty graph', async () => {
      const emptyGraph: GraphData = {
        nodes: [],
        links: []
      };

      const result = await interpreter.run(emptyGraph);

      expect(result.values.size).toBe(0);
    });

    it('should handle graph with nodes but no links', async () => {
      registry.register({
        kind: 'isolated',
        label: 'Isolated',
        outputs: [{ key: 'out', type: 'number' }],
        evaluate: () => ({ out: 123 })
      });

      const graph: GraphData = {
        nodes: [
          { id: 'node1', kind: 'isolated', x: 0, y: 0 },
          { id: 'node2', kind: 'isolated', x: 100, y: 0 }
        ],
        links: []
      };

      const result = await interpreter.run(graph);

      expect(result.values.get('node1')).toEqual({ out: 123 });
      expect(result.values.get('node2')).toEqual({ out: 123 });
    });
  });
});