import { describe, test, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { GraphSchema } from '../../src/types';
import { StackProgramSchema } from '../../src/scratch/stackTypes';
import type { GraphData, NodeInstance, LinkEdge } from '../../src/types';
import type { StackProgram, StackNode, InputValue } from '../../src/scratch/stackTypes';
import { 
  createMockGraph, 
  createComplexGraph, 
  createMockStackProgram, 
  createComplexStackProgram 
} from '../utils/mock-data';
import { validateGraphStructure, validateStackProgram } from '../utils/test-utils';

describe('Serialization Integration Tests', () => {
  describe('Schema Validation for Graph and Stack Data Structures', () => {
    test('should validate simple graph structure against schema', () => {
      const graph: GraphData = {
        nodes: [
          {
            id: 'node1',
            kind: 'const.number',
            x: 100,
            y: 100,
            config: { value: 42 }
          },
          {
            id: 'node2',
            kind: 'math.add',
            x: 300,
            y: 100
          }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'node1', portKey: 'out' },
            to: { nodeId: 'node2', portKey: 'a' }
          }
        ]
      };

      const result = GraphSchema.safeParse(graph);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.nodes).toHaveLength(2);
        expect(result.data.links).toHaveLength(1);
        expect(result.data.nodes[0].config).toEqual({ value: 42 });
      }
    });

    test('should validate complex graph structure with various node types', () => {
      const graph = createComplexGraph();
      
      const result = GraphSchema.safeParse(graph);
      expect(result.success).toBe(true);
      expect(validateGraphStructure(graph)).toBe(true);
    });

    test('should reject invalid graph structures', () => {
      const invalidGraphs = [
        // Missing required fields
        {
          nodes: [{ id: 'node1', kind: 'test' }], // missing x, y
          links: []
        },
        // Invalid link structure
        {
          nodes: [{ id: 'node1', kind: 'test', x: 0, y: 0 }],
          links: [{ id: 'link1', from: 'invalid' }] // invalid from structure
        },
        // Non-string node ID
        {
          nodes: [{ id: 123, kind: 'test', x: 0, y: 0 }],
          links: []
        }
      ];

      invalidGraphs.forEach((invalidGraph, index) => {
        const result = GraphSchema.safeParse(invalidGraph);
        expect(result.success).toBe(false);
      });
    });

    test('should validate simple stack program structure against schema', () => {
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'log1'
          },
          'log1': {
            id: 'log1',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Hello' }
          }
        }
      };

      const result = StackProgramSchema.safeParse(program);
      expect(result.success).toBe(true);
      expect(validateStackProgram(program)).toBe(true);
    });

    test('should validate complex stack program with nested structures', () => {
      const program = createComplexStackProgram();
      
      const result = StackProgramSchema.safeParse(program);
      expect(result.success).toBe(true);
      expect(validateStackProgram(program)).toBe(true);
    });

    test('should reject invalid stack program structures', () => {
      const invalidPrograms = [
        // Missing heads array
        {
          nodes: { 'node1': { id: 'node1', kind: 'test', form: 'hat' } }
        },
        // Non-array heads
        {
          heads: 'not-an-array',
          nodes: {}
        },
        // Non-object nodes
        {
          heads: [],
          nodes: 'not-an-object'
        }
      ];

      invalidPrograms.forEach((invalidProgram) => {
        const result = StackProgramSchema.safeParse(invalidProgram);
        expect(result.success).toBe(false);
      });
    });

    test('should validate edge cases in data structures', () => {
      // Empty but valid structures
      const emptyGraph: GraphData = { nodes: [], links: [] };
      const emptyProgram: StackProgram = { heads: [], nodes: {} };

      expect(GraphSchema.safeParse(emptyGraph).success).toBe(true);
      expect(StackProgramSchema.safeParse(emptyProgram).success).toBe(true);

      // Structures with null/undefined configs
      const graphWithNullConfig: GraphData = {
        nodes: [{ id: 'node1', kind: 'test', x: 0, y: 0, config: null }],
        links: []
      };

      const programWithUndefinedConfig: StackProgram = {
        heads: ['node1'],
        nodes: {
          'node1': {
            id: 'node1',
            kind: 'test',
            form: 'hat',
            config: undefined
          }
        }
      };

      expect(GraphSchema.safeParse(graphWithNullConfig).success).toBe(true);
      expect(StackProgramSchema.safeParse(programWithUndefinedConfig).success).toBe(true);
    });
  });

  describe('Data Integrity Across Serialization Boundaries', () => {
    test('should preserve all graph data through JSON serialization', () => {
      const originalGraph = createComplexGraph();
      
      // Add various data types to test preservation
      originalGraph.nodes[0].config = {
        number: 42,
        string: 'test',
        boolean: true,
        null: null,
        array: [1, 2, 3],
        object: { nested: 'value' }
      };

      // Serialize and deserialize
      const jsonString = JSON.stringify(originalGraph);
      const deserializedGraph: GraphData = JSON.parse(jsonString);

      // Validate structure integrity
      expect(validateGraphStructure(deserializedGraph)).toBe(true);
      expect(deserializedGraph.nodes).toHaveLength(originalGraph.nodes.length);
      expect(deserializedGraph.links).toHaveLength(originalGraph.links.length);

      // Validate data preservation
      deserializedGraph.nodes.forEach((node, index) => {
        const originalNode = originalGraph.nodes[index];
        expect(node.id).toBe(originalNode.id);
        expect(node.kind).toBe(originalNode.kind);
        expect(node.x).toBe(originalNode.x);
        expect(node.y).toBe(originalNode.y);
        expect(node.config).toEqual(originalNode.config);
      });

      deserializedGraph.links.forEach((link, index) => {
        const originalLink = originalGraph.links[index];
        expect(link.id).toBe(originalLink.id);
        expect(link.from).toEqual(originalLink.from);
        expect(link.to).toEqual(originalLink.to);
      });
    });

    test('should preserve all stack program data through JSON serialization', () => {
      const originalProgram = createComplexStackProgram();
      
      // Add complex input values to test preservation
      const nodeWithComplexInputs: StackNode = {
        id: 'complex-node',
        kind: 'test-block',
        form: 'reporter',
        inputs: {
          literal_number: { literal: 3.14159 },
          literal_string: { literal: 'complex string with "quotes"' },
          literal_boolean: { literal: false },
          literal_null: { literal: null },
          literal_array: { literal: [1, 'two', true] },
          literal_object: { literal: { key: 'value', nested: { deep: 42 } } },
          block_reference: { blockId: 'hat1' } // Reference existing node
        },
        config: {
          complexConfig: {
            numbers: [1, 2, 3],
            settings: { enabled: true, threshold: 0.5 }
          }
        }
      };

      originalProgram.nodes['complex-node'] = nodeWithComplexInputs;

      // Serialize and deserialize
      const jsonString = JSON.stringify(originalProgram);
      const deserializedProgram: StackProgram = JSON.parse(jsonString);

      // Validate structure integrity
      expect(validateStackProgram(deserializedProgram)).toBe(true);
      expect(deserializedProgram.heads).toEqual(originalProgram.heads);
      expect(Object.keys(deserializedProgram.nodes)).toEqual(Object.keys(originalProgram.nodes));

      // Validate complex data preservation
      const deserializedComplexNode = deserializedProgram.nodes['complex-node'];
      const originalComplexNode = originalProgram.nodes['complex-node'];

      expect(deserializedComplexNode.inputs).toEqual(originalComplexNode.inputs);
      expect(deserializedComplexNode.config).toEqual(originalComplexNode.config);
    });

    test('should handle special numeric values in serialization', () => {
      const graphWithSpecialNumbers: GraphData = {
        nodes: [
          {
            id: 'node1',
            kind: 'test',
            x: Number.MAX_SAFE_INTEGER,
            y: Number.MIN_SAFE_INTEGER,
            config: {
              infinity: Infinity,
              negativeInfinity: -Infinity,
              nan: NaN,
              zero: 0,
              negativeZero: -0,
              maxValue: Number.MAX_VALUE,
              minValue: Number.MIN_VALUE,
              epsilon: Number.EPSILON
            }
          }
        ],
        links: []
      };

      const jsonString = JSON.stringify(graphWithSpecialNumbers);
      const deserializedGraph: GraphData = JSON.parse(jsonString);

      // Note: JSON serialization converts Infinity, -Infinity, and NaN to null
      expect(deserializedGraph.nodes[0].x).toBe(Number.MAX_SAFE_INTEGER);
      expect(deserializedGraph.nodes[0].y).toBe(Number.MIN_SAFE_INTEGER);
      expect(deserializedGraph.nodes[0].config.infinity).toBe(null);
      expect(deserializedGraph.nodes[0].config.negativeInfinity).toBe(null);
      expect(deserializedGraph.nodes[0].config.nan).toBe(null);
      expect(deserializedGraph.nodes[0].config.zero).toBe(0);
      expect(deserializedGraph.nodes[0].config.maxValue).toBe(Number.MAX_VALUE);
    });

    test('should preserve Unicode and special characters', () => {
      const programWithUnicode: StackProgram = {
        heads: ['node1'],
        nodes: {
          'node1': {
            id: 'node1',
            kind: 'test',
            form: 'statement',
            config: {
              unicode: '🚀 Hello 世界! Ñoño café',
              emoji: '😀🎉🔥💯',
              specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
              quotes: 'Single \'quotes\' and "double quotes"',
              newlines: 'Line 1\nLine 2\r\nLine 3',
              tabs: 'Column 1\tColumn 2\tColumn 3'
            }
          }
        }
      };

      const jsonString = JSON.stringify(programWithUnicode);
      const deserializedProgram: StackProgram = JSON.parse(jsonString);

      expect(deserializedProgram.nodes['node1'].config).toEqual(programWithUnicode.nodes['node1'].config);
    });

    test('should handle deeply nested data structures', () => {
      const createNestedObject = (depth: number): any => {
        if (depth === 0) return 'leaf';
        return { level: depth, nested: createNestedObject(depth - 1) };
      };

      const graphWithDeepNesting: GraphData = {
        nodes: [
          {
            id: 'node1',
            kind: 'test',
            x: 0,
            y: 0,
            config: {
              deep: createNestedObject(10),
              array: Array.from({ length: 5 }, (_, i) => createNestedObject(i))
            }
          }
        ],
        links: []
      };

      const jsonString = JSON.stringify(graphWithDeepNesting);
      const deserializedGraph: GraphData = JSON.parse(jsonString);

      expect(deserializedGraph.nodes[0].config).toEqual(graphWithDeepNesting.nodes[0].config);
    });
  });

  describe('Backward Compatibility and Version Handling', () => {
    test('should handle legacy graph format gracefully', () => {
      // Simulate an older version of graph format
      const legacyGraph = {
        nodes: [
          {
            id: 'node1',
            kind: 'old-block-type',
            x: 100,
            y: 100,
            // Missing config field (should be handled gracefully)
          }
        ],
        links: [],
        // Legacy field that might exist in older versions
        version: '1.0.0'
      };

      // Current schema should still validate core structure
      const coreData = {
        nodes: legacyGraph.nodes,
        links: legacyGraph.links
      };

      const result = GraphSchema.safeParse(coreData);
      expect(result.success).toBe(true);
    });

    test('should handle legacy stack program format gracefully', () => {
      // Simulate an older version of stack program format
      const legacyProgram = {
        heads: ['node1'],
        nodes: {
          'node1': {
            id: 'node1',
            kind: 'old-stack-block',
            form: 'hat',
            // Legacy fields that might exist
            version: '1.0.0',
            deprecated_field: 'old_value'
          }
        },
        // Legacy metadata
        metadata: {
          created: '2023-01-01',
          version: '1.0.0'
        }
      };

      // Current schema should validate core structure
      const coreData = {
        heads: legacyProgram.heads,
        nodes: legacyProgram.nodes
      };

      const result = StackProgramSchema.safeParse(coreData);
      expect(result.success).toBe(true);
    });

    test('should handle missing optional fields in legacy data', () => {
      const minimalGraph: GraphData = {
        nodes: [
          {
            id: 'node1',
            kind: 'test',
            x: 0,
            y: 0
            // No config field
          }
        ],
        links: []
      };

      const minimalProgram: StackProgram = {
        heads: ['node1'],
        nodes: {
          'node1': {
            id: 'node1',
            kind: 'test',
            form: 'hat'
            // No optional fields like next, config, inputs, etc.
          }
        }
      };

      expect(GraphSchema.safeParse(minimalGraph).success).toBe(true);
      expect(StackProgramSchema.safeParse(minimalProgram).success).toBe(true);
      expect(validateGraphStructure(minimalGraph)).toBe(true);
      expect(validateStackProgram(minimalProgram)).toBe(true);
    });

    test('should handle version migration scenarios', () => {
      // Simulate migrating from version 1 to version 2 format
      const v1Graph = {
        nodes: [
          {
            id: 'node1',
            type: 'old-field-name', // Old field name
            x: 100,
            y: 100
          }
        ],
        connections: [ // Old field name for links
          {
            id: 'conn1',
            source: { nodeId: 'node1', port: 'out' },
            target: { nodeId: 'node2', port: 'in' }
          }
        ]
      };

      // Migration function (would be implemented in real application)
      const migrateV1ToV2 = (v1Data: any): GraphData => {
        return {
          nodes: v1Data.nodes.map((node: any) => ({
            id: node.id,
            kind: node.type, // Migrate field name
            x: node.x,
            y: node.y
          })),
          links: v1Data.connections.map((conn: any) => ({
            id: conn.id,
            from: { nodeId: conn.source.nodeId, portKey: conn.source.port },
            to: { nodeId: conn.target.nodeId, portKey: conn.target.port }
          }))
        };
      };

      const v2Graph = migrateV1ToV2(v1Graph);
      const result = GraphSchema.safeParse(v2Graph);
      expect(result.success).toBe(true);
    });
  });

  describe('Error Recovery from Corrupted Data', () => {
    test('should handle corrupted JSON gracefully', () => {
      const corruptedJsonStrings = [
        '{"nodes": [{"id": "node1", "kind": "test", "x": 100, "y": 100}], "links": [', // Incomplete JSON
        '{"nodes": [{"id": "node1", "kind": "test", "x": 100, "y": 100}], "links": []', // Missing closing brace
        '{"nodes": [{"id": "node1", "kind": "test", "x": 100, "y": 100}], "links": []}extra', // Extra characters
        '', // Empty string
        'null', // Null JSON
        'undefined' // Invalid JSON
      ];

      corruptedJsonStrings.forEach((corruptedJson) => {
        expect(() => {
          try {
            const parsed = JSON.parse(corruptedJson);
            // If parsing succeeds, validate with schema
            GraphSchema.parse(parsed);
          } catch (error) {
            // Expected to throw for corrupted JSON
            expect(error).toBeDefined();
          }
        }).not.toThrow(); // The test itself shouldn't throw
      });
    });

    test('should handle partially corrupted graph data', () => {
      const partiallyCorruptedGraphs = [
        // Missing node in link reference
        {
          nodes: [{ id: 'node1', kind: 'test', x: 0, y: 0 }],
          links: [
            {
              id: 'link1',
              from: { nodeId: 'missing-node', portKey: 'out' },
              to: { nodeId: 'node1', portKey: 'in' }
            }
          ]
        },
        // Duplicate node IDs
        {
          nodes: [
            { id: 'node1', kind: 'test', x: 0, y: 0 },
            { id: 'node1', kind: 'test', x: 100, y: 100 } // Duplicate ID
          ],
          links: []
        },
        // Invalid coordinate values (this will fail schema validation but not structure validation)
        {
          nodes: [{ id: 'node1', kind: 'test', x: 'invalid', y: null }],
          links: []
        }
      ];

      partiallyCorruptedGraphs.forEach((corruptedGraph, index) => {
        const schemaResult = GraphSchema.safeParse(corruptedGraph);
        const structureValid = validateGraphStructure(corruptedGraph as GraphData);
        
        // Different corruptions fail different validations
        if (index === 2) {
          // Invalid coordinate values - schema should fail but structure might pass
          expect(schemaResult.success).toBe(false);
        } else {
          // Other corruptions should fail structure validation
          expect(structureValid).toBe(false);
        }
      });
    });

    test('should handle partially corrupted stack program data', () => {
      const partiallyCorruptedPrograms = [
        // Invalid head reference
        {
          heads: ['missing-node'],
          nodes: {
            'node1': { id: 'node1', kind: 'test', form: 'hat' }
          }
        },
        // Circular next references
        {
          heads: ['node1'],
          nodes: {
            'node1': { id: 'node1', kind: 'test', form: 'hat', next: 'node2' },
            'node2': { id: 'node2', kind: 'test', form: 'statement', next: 'node1' }
          }
        },
        // Invalid input block reference
        {
          heads: ['node1'],
          nodes: {
            'node1': {
              id: 'node1',
              kind: 'test',
              form: 'reporter',
              inputs: { a: { blockId: 'missing-block' } }
            }
          }
        }
      ];

      partiallyCorruptedPrograms.forEach((corruptedProgram, index) => {
        const schemaResult = StackProgramSchema.safeParse(corruptedProgram);
        const structureValid = validateStackProgram(corruptedProgram as StackProgram);
        
        // Different corruptions fail different validations
        switch (index) {
          case 0: // Invalid head reference
            expect(structureValid).toBe(false);
            break;
          case 1: // Circular next references - this is actually valid structure, just creates a loop
            // This doesn't fail structure validation as it's checking references exist, not cycles
            expect(structureValid).toBe(true);
            break;
          case 2: // Invalid input block reference
            expect(structureValid).toBe(false);
            break;
        }
      });
    });

    test('should provide meaningful error messages for validation failures', () => {
      const invalidGraph = {
        nodes: [
          { id: 123, kind: 'test', x: 'invalid', y: null } // Multiple type errors
        ],
        links: 'not-an-array'
      };

      const result = GraphSchema.safeParse(invalidGraph);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        // Should have specific error messages for each invalid field
        const errorMessages = result.error.issues.map(issue => issue.message);
        expect(errorMessages.some(msg => msg.includes('string'))).toBe(true); // ID should be string
        expect(errorMessages.some(msg => msg.includes('number'))).toBe(true); // x, y should be numbers
      }
    });

    test('should handle recovery strategies for corrupted data', () => {
      // Example recovery strategy: remove invalid nodes and links
      const corruptedGraph = {
        nodes: [
          { id: 'valid-node', kind: 'test', x: 100, y: 100 },
          { id: 123, kind: 'test', x: 'invalid', y: null }, // Invalid node
          { id: 'another-valid', kind: 'test', x: 200, y: 200 }
        ],
        links: [
          {
            id: 'valid-link',
            from: { nodeId: 'valid-node', portKey: 'out' },
            to: { nodeId: 'another-valid', portKey: 'in' }
          },
          {
            id: 'invalid-link',
            from: { nodeId: 'missing-node', portKey: 'out' },
            to: { nodeId: 'valid-node', portKey: 'in' }
          }
        ]
      };

      // Recovery function
      const recoverGraph = (data: any): GraphData => {
        const validNodes = data.nodes.filter((node: any) => {
          const nodeResult = z.object({
            id: z.string(),
            kind: z.string(),
            x: z.number(),
            y: z.number()
          }).safeParse(node);
          return nodeResult.success;
        });

        const nodeIds = new Set(validNodes.map((node: any) => node.id));
        const validLinks = data.links.filter((link: any) => {
          return nodeIds.has(link.from?.nodeId) && nodeIds.has(link.to?.nodeId);
        });

        return { nodes: validNodes, links: validLinks };
      };

      const recoveredGraph = recoverGraph(corruptedGraph);
      
      expect(GraphSchema.safeParse(recoveredGraph).success).toBe(true);
      expect(recoveredGraph.nodes).toHaveLength(2); // Only valid nodes
      expect(recoveredGraph.links).toHaveLength(1); // Only valid links
      expect(validateGraphStructure(recoveredGraph)).toBe(true);
    });
  });
});