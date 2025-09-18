import { describe, test, expect, beforeEach } from 'vitest';
import { BlockRegistry } from '../../src/BlockRegistry';
import { Interpreter } from '../../src/Interpreter';
import { useGraph, serialize } from '../../src/Graph';
import { DefaultBlocks } from '../../src/DefaultBlocks';
import { GraphSchema } from '../../src/types';
import type { GraphData } from '../../src/types';
import { 
  createMockGraph, 
  createComplexGraph, 
  createTestBlockSpecs
} from '../utils/mock-data';
import { 
  validateGraphStructure,
  measureExecutionTime,
  createLargeGraph,
  expectToThrowError
} from '../utils/test-utils';

describe('Graph Workflow Integration Tests', () => {
  let registry: BlockRegistry;
  let interpreter: Interpreter;

  beforeEach(() => {
    registry = new BlockRegistry();
    DefaultBlocks.forEach(block => registry.register(block));
    interpreter = new Interpreter(registry);
    
    // Reset graph state
    useGraph.getState().load({ nodes: [], links: [] });
  });

  describe('Complete Graph Creation, Connection, and Execution Workflow', () => {
    test('should create a simple linear graph and execute it successfully', async () => {
      const graph = useGraph.getState();
      
      // Step 1: Create nodes
      const node1Id = graph.addNode({
        kind: 'const.number',
        x: 100,
        y: 100,
        config: { value: 10 }
      });
      
      const node2Id = graph.addNode({
        kind: 'const.number', 
        x: 100,
        y: 200,
        config: { value: 5 }
      });
      
      const node3Id = graph.addNode({
        kind: 'math.add',
        x: 300,
        y: 150
      });
      
      // Step 2: Connect nodes
      const link1Id = graph.addLink(
        { nodeId: node1Id, portKey: 'out' },
        { nodeId: node3Id, portKey: 'a' }
      );
      
      const link2Id = graph.addLink(
        { nodeId: node2Id, portKey: 'out' },
        { nodeId: node3Id, portKey: 'b' }
      );
      
      expect(link1Id).toBeTruthy();
      expect(link2Id).toBeTruthy();
      
      // Step 3: Serialize current state
      const graphData = serialize();
      expect(validateGraphStructure(graphData)).toBe(true);
      expect(graphData.nodes).toHaveLength(3);
      expect(graphData.links).toHaveLength(2);
      
      // Step 4: Execute the graph
      const result = await interpreter.run(graphData);
      
      // Step 5: Validate results
      expect(result.values.has(node1Id)).toBe(true);
      expect(result.values.has(node2Id)).toBe(true);
      expect(result.values.has(node3Id)).toBe(true);
      
      const node1Output = result.values.get(node1Id);
      const node2Output = result.values.get(node2Id);
      const node3Output = result.values.get(node3Id);
      
      expect(node1Output?.out).toBe(10);
      expect(node2Output?.out).toBe(5);
      expect(node3Output?.sum).toBe(15);
    });

    test('should handle complex branching graph with multiple operations', async () => {
      const graph = useGraph.getState();
      
      // Create a more complex graph: (10 + 5) * 2 = 30
      const inputNode1 = graph.addNode({
        kind: 'const.number',
        x: 50,
        y: 50,
        config: { value: 10 }
      });
      
      const inputNode2 = graph.addNode({
        kind: 'const.number',
        x: 50,
        y: 150,
        config: { value: 5 }
      });
      
      const addNode = graph.addNode({
        kind: 'math.add',
        x: 250,
        y: 100
      });
      
      const inputNode3 = graph.addNode({
        kind: 'const.number',
        x: 250,
        y: 200,
        config: { value: 2 }
      });
      
      const multiplyNode = graph.addNode({
        kind: 'math.mul',
        x: 450,
        y: 150
      });
      
      // Connect the graph
      graph.addLink(
        { nodeId: inputNode1, portKey: 'out' },
        { nodeId: addNode, portKey: 'a' }
      );
      
      graph.addLink(
        { nodeId: inputNode2, portKey: 'out' },
        { nodeId: addNode, portKey: 'b' }
      );
      
      graph.addLink(
        { nodeId: addNode, portKey: 'sum' },
        { nodeId: multiplyNode, portKey: 'a' }
      );
      
      graph.addLink(
        { nodeId: inputNode3, portKey: 'out' },
        { nodeId: multiplyNode, portKey: 'b' }
      );
      
      const graphData = serialize();
      const result = await interpreter.run(graphData);
      
      // Validate the computation chain
      expect(result.values.get(addNode)?.sum).toBe(15);
      expect(result.values.get(multiplyNode)?.prod).toBe(30);
    });

    test('should handle graph with type conversion workflow', async () => {
      const graph = useGraph.getState();
      
      // Create a workflow: number -> string -> print
      const numberNode = graph.addNode({
        kind: 'const.number',
        x: 100,
        y: 100,
        config: { value: 42 }
      });
      
      const toStringNode = graph.addNode({
        kind: 'to.string',
        x: 300,
        y: 100
      });
      
      const printNode = graph.addNode({
        kind: 'io.print',
        x: 500,
        y: 100
      });
      
      // Connect the workflow
      graph.addLink(
        { nodeId: numberNode, portKey: 'out' },
        { nodeId: toStringNode, portKey: 'value' }
      );
      
      graph.addLink(
        { nodeId: toStringNode, portKey: 'out' },
        { nodeId: printNode, portKey: 'msg' }
      );
      
      const graphData = serialize();
      const result = await interpreter.run(graphData);
      
      // Validate type conversions
      expect(result.values.get(numberNode)?.out).toBe(42);
      expect(result.values.get(toStringNode)?.out).toBe('42');
      expect(result.values.get(printNode)?.done).toBe(true);
    });
  });

  describe('Serialization Roundtrip with Complex Graphs', () => {
    test('should serialize and deserialize complex graph without data loss', async () => {
      const graph = useGraph.getState();
      
      // Create a complex graph structure
      const nodes = [
        { kind: 'const.number', config: { value: 1 } },
        { kind: 'const.number', config: { value: 2 } },
        { kind: 'const.number', config: { value: 3 } },
        { kind: 'math.add' },
        { kind: 'math.mul' },
        { kind: 'to.string' }
      ];
      
      const nodeIds = nodes.map((nodeSpec, i) => 
        graph.addNode({
          ...nodeSpec,
          x: 100 + (i % 3) * 200,
          y: 100 + Math.floor(i / 3) * 150
        })
      );
      
      // Create complex linking pattern
      const links = [
        [0, 3, 'out', 'a'], // node1 -> add.a
        [1, 3, 'out', 'b'], // node2 -> add.b
        [2, 4, 'out', 'a'], // node3 -> mul.a
        [3, 4, 'sum', 'b'], // add -> mul.b
        [4, 5, 'prod', 'value'] // mul -> toString
      ];
      
      links.forEach(([fromIdx, toIdx, fromPort, toPort]) => {
        graph.addLink(
          { nodeId: nodeIds[fromIdx], portKey: fromPort as string },
          { nodeId: nodeIds[toIdx], portKey: toPort as string }
        );
      });
      
      // Step 1: Serialize original graph
      const originalGraph = serialize();
      expect(validateGraphStructure(originalGraph)).toBe(true);
      
      // Step 2: Execute original
      const originalResult = await interpreter.run(originalGraph);
      
      // Step 3: Serialize to JSON and back (simulating save/load)
      const jsonString = JSON.stringify(originalGraph);
      const parsedGraph: GraphData = JSON.parse(jsonString);
      
      // Step 4: Validate schema compliance
      const schemaResult = GraphSchema.safeParse(parsedGraph);
      expect(schemaResult.success).toBe(true);
      
      // Step 5: Load into new graph state
      graph.load(parsedGraph);
      const reloadedGraph = serialize();
      
      // Step 6: Execute reloaded graph
      const reloadedResult = await interpreter.run(reloadedGraph);
      
      // Step 7: Compare results
      expect(reloadedGraph.nodes).toHaveLength(originalGraph.nodes.length);
      expect(reloadedGraph.links).toHaveLength(originalGraph.links.length);
      
      // Verify execution results are identical
      for (const nodeId of nodeIds) {
        const originalOutput = originalResult.values.get(nodeId);
        const reloadedOutput = reloadedResult.values.get(nodeId);
        expect(reloadedOutput).toEqual(originalOutput);
      }
    });

    test('should handle serialization of graphs with various node configurations', async () => {
      const graph = useGraph.getState();
      
      // Create nodes with different config types
      const nodeConfigs = [
        { kind: 'const.number', config: { value: 0 } },
        { kind: 'const.number', config: { value: -42.5 } },
        { kind: 'const.number', config: { value: Number.MAX_SAFE_INTEGER } },
        { kind: 'const.number', config: undefined },
        { kind: 'math.add', config: {} }
      ];
      
      const nodeIds = nodeConfigs.map((nodeSpec, i) => 
        graph.addNode({
          ...nodeSpec,
          x: i * 150,
          y: 100
        })
      );
      
      const originalGraph = serialize();
      
      // Serialize and deserialize
      const jsonString = JSON.stringify(originalGraph);
      const parsedGraph: GraphData = JSON.parse(jsonString);
      
      // Validate all config values are preserved
      parsedGraph.nodes.forEach((node, i) => {
        const originalNode = originalGraph.nodes[i];
        expect(node.config).toEqual(originalNode.config);
        expect(node.kind).toBe(originalNode.kind);
        expect(node.x).toBe(originalNode.x);
        expect(node.y).toBe(originalNode.y);
      });
    });
  });

  describe('Error Scenarios with Invalid Graphs and Missing Blocks', () => {
    test('should handle circular dependency detection', async () => {
      const graph = useGraph.getState();
      
      // Create circular dependency: A -> B -> A
      const nodeA = graph.addNode({
        kind: 'math.add',
        x: 100,
        y: 100
      });
      
      const nodeB = graph.addNode({
        kind: 'math.mul',
        x: 300,
        y: 100
      });
      
      // Create circular links
      graph.addLink(
        { nodeId: nodeA, portKey: 'sum' },
        { nodeId: nodeB, portKey: 'a' }
      );
      
      graph.addLink(
        { nodeId: nodeB, portKey: 'prod' },
        { nodeId: nodeA, portKey: 'a' }
      );
      
      const graphData = serialize();
      
      await expectToThrowError(
        () => interpreter.run(graphData),
        'Graph contains a cycle'
      );
    });

    test('should handle missing block specifications gracefully', async () => {
      const graphData: GraphData = {
        nodes: [
          {
            id: 'unknown-node',
            kind: 'non-existent-block',
            x: 100,
            y: 100
          }
        ],
        links: []
      };
      
      await expectToThrowError(
        () => interpreter.run(graphData),
        'Unknown block: non-existent-block'
      );
    });

    test('should handle malformed graph structures', async () => {
      // Test with invalid link references
      const graphData: GraphData = {
        nodes: [
          {
            id: 'valid-node',
            kind: 'const.number',
            x: 100,
            y: 100,
            config: { value: 5 }
          }
        ],
        links: [
          {
            id: 'invalid-link',
            from: { nodeId: 'non-existent-node', portKey: 'out' },
            to: { nodeId: 'valid-node', portKey: 'in' }
          }
        ]
      };
      
      expect(validateGraphStructure(graphData)).toBe(false);
    });

    test('should handle nodes with invalid configurations', async () => {
      const graph = useGraph.getState();
      
      // Create node with invalid config that might cause evaluation errors
      const nodeId = graph.addNode({
        kind: 'const.number',
        x: 100,
        y: 100,
        config: { value: 'not-a-number' } // Invalid type
      });
      
      const graphData = serialize();
      
      // Should still execute but handle the invalid config gracefully
      const result = await interpreter.run(graphData);
      
      // The DefaultBlocks should handle invalid configs gracefully
      expect(result.values.has(nodeId)).toBe(true);
    });

    test('should handle disconnected graph components', async () => {
      const graph = useGraph.getState();
      
      // Create two separate components
      const component1Node1 = graph.addNode({
        kind: 'const.number',
        x: 100,
        y: 100,
        config: { value: 10 }
      });
      
      const component1Node2 = graph.addNode({
        kind: 'math.add',
        x: 300,
        y: 100
      });
      
      const component2Node1 = graph.addNode({
        kind: 'const.number',
        x: 100,
        y: 300,
        config: { value: 20 }
      });
      
      const component2Node2 = graph.addNode({
        kind: 'math.mul',
        x: 300,
        y: 300
      });
      
      // Connect within components but not between them
      graph.addLink(
        { nodeId: component1Node1, portKey: 'out' },
        { nodeId: component1Node2, portKey: 'a' }
      );
      
      graph.addLink(
        { nodeId: component2Node1, portKey: 'out' },
        { nodeId: component2Node2, portKey: 'a' }
      );
      
      const graphData = serialize();
      const result = await interpreter.run(graphData);
      
      // Both components should execute independently
      expect(result.values.size).toBe(4);
      expect(result.values.get(component1Node2)?.sum).toBe(10); // 10 + 0 (default)
      expect(result.values.get(component2Node2)?.prod).toBe(20); // 20 * 1 (default)
    });
  });

  describe('Performance with Moderately Complex Graphs', () => {
    test('should execute medium-sized graphs within reasonable time', async () => {
      const nodeCount = 50;
      const graphData = createLargeGraph(nodeCount);
      
      // Register test blocks for the large graph
      const testRegistry = new BlockRegistry();
      testRegistry.register({
        kind: 'add',
        label: 'Add',
        inputs: [
          { key: 'a', type: 'number', defaultValue: 0 },
          { key: 'b', type: 'number', defaultValue: 0 }
        ],
        outputs: [{ key: 'result', type: 'number' }],
        evaluate: ({ inputs }) => ({ result: (inputs.a as number) + (inputs.b as number) })
      });
      
      testRegistry.register({
        kind: 'multiply',
        label: 'Multiply',
        inputs: [
          { key: 'a', type: 'number', defaultValue: 1 },
          { key: 'b', type: 'number', defaultValue: 1 }
        ],
        outputs: [{ key: 'result', type: 'number' }],
        evaluate: ({ inputs }) => ({ result: (inputs.a as number) * (inputs.b as number) })
      });
      
      const testInterpreter = new Interpreter(testRegistry);
      
      const { result, time } = await measureExecutionTime(() => 
        testInterpreter.run(graphData)
      );
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(time).toBeLessThan(1000); // 1 second
      expect(result.values.size).toBe(nodeCount);
    });

    test('should handle graphs with deep execution chains', async () => {
      const graph = useGraph.getState();
      
      // Create a deep chain: input -> add -> add -> add -> ... (10 levels)
      const chainLength = 10;
      let previousNodeId = graph.addNode({
        kind: 'const.number',
        x: 50,
        y: 100,
        config: { value: 1 }
      });
      
      for (let i = 0; i < chainLength; i++) {
        const addNodeId = graph.addNode({
          kind: 'math.add',
          x: 150 + i * 100,
          y: 100
        });
        
        const constantNodeId = graph.addNode({
          kind: 'const.number',
          x: 150 + i * 100,
          y: 200,
          config: { value: 1 }
        });
        
        graph.addLink(
          { nodeId: previousNodeId, portKey: i === 0 ? 'out' : 'sum' },
          { nodeId: addNodeId, portKey: 'a' }
        );
        
        graph.addLink(
          { nodeId: constantNodeId, portKey: 'out' },
          { nodeId: addNodeId, portKey: 'b' }
        );
        
        previousNodeId = addNodeId;
      }
      
      const graphData = serialize();
      const { result, time } = await measureExecutionTime(() => 
        interpreter.run(graphData)
      );
      
      // Should execute the chain correctly
      expect(time).toBeLessThan(100); // Should be fast for this size
      
      // Final result should be 1 + 10 = 11 (initial 1 + 10 additions of 1)
      const finalResult = result.values.get(previousNodeId);
      expect(finalResult?.sum).toBe(11);
    });

    test('should handle graphs with wide branching patterns', async () => {
      const graph = useGraph.getState();
      
      // Create a wide branching pattern: one input feeding many operations
      const inputNode = graph.addNode({
        kind: 'const.number',
        x: 100,
        y: 300,
        config: { value: 10 }
      });
      
      const branchCount = 20;
      const branchNodes: string[] = [];
      
      for (let i = 0; i < branchCount; i++) {
        const addNode = graph.addNode({
          kind: 'math.add',
          x: 300 + (i % 5) * 150,
          y: 100 + Math.floor(i / 5) * 100
        });
        
        graph.addLink(
          { nodeId: inputNode, portKey: 'out' },
          { nodeId: addNode, portKey: 'a' }
        );
        
        branchNodes.push(addNode);
      }
      
      const graphData = serialize();
      const { result, time } = await measureExecutionTime(() => 
        interpreter.run(graphData)
      );
      
      expect(time).toBeLessThan(200);
      expect(result.values.size).toBe(branchCount + 1); // branches + input
      
      // All branches should have computed the same result (10 + 0 = 10)
      branchNodes.forEach(nodeId => {
        expect(result.values.get(nodeId)?.sum).toBe(10);
      });
    });
  });
});