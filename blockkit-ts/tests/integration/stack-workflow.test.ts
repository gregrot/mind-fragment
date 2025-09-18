import { describe, test, expect, beforeEach, vi } from 'vitest';
import { StackRegistry } from '../../src/scratch/StackRegistry';
import { StackInterpreter } from '../../src/scratch/StackInterpreter';
import { DefaultStackBlocks } from '../../src/scratch/DefaultStackBlocks';
import { StackProgramSchema } from '../../src/scratch/stackTypes';
import type { StackProgram, StackNode, InputValue } from '../../src/scratch/stackTypes';
import { 
  createMockStackProgram, 
  createComplexStackProgram,
  createTestStackBlockSpecs
} from '../utils/mock-data';
import { 
  validateStackProgram, 
  findNodesByForm, 
  getExecutionOrder,
  expectToThrowError,
  measureExecutionTime
} from '../utils/test-utils';

describe('Stack Workflow Integration Tests', () => {
  let registry: StackRegistry;
  let interpreter: StackInterpreter;
  let mockState: Record<string, unknown>;

  beforeEach(() => {
    registry = new StackRegistry();
    DefaultStackBlocks.forEach(block => registry.register(block));
    mockState = {};
    interpreter = new StackInterpreter(registry, mockState);
    
    // Mock console.log to capture output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('Complete Stack Program Building and Execution', () => {
    test('should build and execute a simple linear stack program', async () => {
      // Create a simple program: when started -> log -> log
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
            config: { msg: 'Starting program' },
            next: 'log2'
          },
          'log2': {
            id: 'log2',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Program complete' }
          }
        }
      };

      expect(validateStackProgram(program)).toBe(true);

      const { time } = await measureExecutionTime(() => interpreter.run(program));
      
      // Should complete quickly
      expect(time).toBeLessThan(100); // Should be very fast
      
      // Verify console output
      expect(console.log).toHaveBeenCalledWith('🚀 Starting script...');
      expect(console.log).toHaveBeenCalledWith('💬 Starting program');
      expect(console.log).toHaveBeenCalledWith('💬 Program complete');
    });

    test('should execute program with reporter blocks and calculations', async () => {
      // Create program: when started -> log (5 + 3)
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
            config: { msg: 'Result: 8' }, // We'll calculate this with reporters
            next: 'add1'
          },
          'add1': {
            id: 'add1',
            kind: 'op.add',
            form: 'reporter',
            inputs: {
              a: { literal: 5 },
              b: { literal: 3 }
            }
          }
        }
      };

      await interpreter.run(program);
      
      expect(console.log).toHaveBeenCalledWith('🧮 5 + 3 = 8');
    });

    test('should handle nested reporter blocks', async () => {
      // Create program: when started -> log ((5 + 3) + (2 + 1))
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'outerAdd'
          },
          'outerAdd': {
            id: 'outerAdd',
            kind: 'op.add',
            form: 'reporter',
            inputs: {
              a: { blockId: 'add1' },
              b: { blockId: 'add2' }
            }
          },
          'add1': {
            id: 'add1',
            kind: 'op.add',
            form: 'reporter',
            inputs: {
              a: { literal: 5 },
              b: { literal: 3 }
            }
          },
          'add2': {
            id: 'add2',
            kind: 'op.add',
            form: 'reporter',
            inputs: {
              a: { literal: 2 },
              b: { literal: 1 }
            }
          }
        }
      };

      await interpreter.run(program);
      
      // Should execute nested calculations
      expect(console.log).toHaveBeenCalledWith('🧮 5 + 3 = 8');
      expect(console.log).toHaveBeenCalledWith('🧮 2 + 1 = 3');
      expect(console.log).toHaveBeenCalledWith('🧮 8 + 3 = 11');
    });
  });

  describe('Different Program Structures and Control Flows', () => {
    test('should execute C-block with repeat loop', async () => {
      // Create program: when started -> repeat 3 times { log "Loop iteration" }
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'repeat1'
          },
          'repeat1': {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            config: { times: 3 },
            slotHeads: { DO: 'log1' }
          },
          'log1': {
            id: 'log1',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Loop iteration' },
            parent: 'repeat1',
            inSlot: 'DO'
          }
        }
      };

      await interpreter.run(program);
      
      expect(console.log).toHaveBeenCalledWith('🔄 Repeating 3 times...');
      expect(console.log).toHaveBeenCalledWith('  Loop 1/3');
      expect(console.log).toHaveBeenCalledWith('  Loop 2/3');
      expect(console.log).toHaveBeenCalledWith('  Loop 3/3');
      expect(console.log).toHaveBeenCalledWith('💬 Loop iteration');
      
      // Should be called: start + repeat + 3*(loop + msg) = 1 + 1 + 3*2 = 8 times
      expect(console.log).toHaveBeenCalledTimes(8);
    });

    test('should execute conditional if block with true condition', async () => {
      // Create program: when started -> if (5 > 3) { log "Condition met" }
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'if1'
          },
          'if1': {
            id: 'if1',
            kind: 'control.if',
            form: 'c',
            inputs: {
              condition: { blockId: 'gt1' }
            },
            slotHeads: { THEN: 'log1' }
          },
          'gt1': {
            id: 'gt1',
            kind: 'op.gt',
            form: 'predicate',
            inputs: {
              a: { literal: 5 },
              b: { literal: 3 }
            }
          },
          'log1': {
            id: 'log1',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Condition met' },
            parent: 'if1',
            inSlot: 'THEN'
          }
        }
      };

      await interpreter.run(program);
      
      expect(console.log).toHaveBeenCalledWith('🔍 5 > 3 = true');
      expect(console.log).toHaveBeenCalledWith('✅ Condition is true, executing then block');
      expect(console.log).toHaveBeenCalledWith('💬 Condition met');
    });

    test('should execute conditional if block with false condition', async () => {
      // Create program: when started -> if (3 > 5) { log "Should not execute" }
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'if1'
          },
          'if1': {
            id: 'if1',
            kind: 'control.if',
            form: 'c',
            inputs: {
              condition: { blockId: 'gt1' }
            },
            slotHeads: { THEN: 'log1' }
          },
          'gt1': {
            id: 'gt1',
            kind: 'op.gt',
            form: 'predicate',
            inputs: {
              a: { literal: 3 },
              b: { literal: 5 }
            }
          },
          'log1': {
            id: 'log1',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Should not execute' },
            parent: 'if1',
            inSlot: 'THEN'
          }
        }
      };

      await interpreter.run(program);
      
      expect(console.log).toHaveBeenCalledWith('🔍 3 > 5 = false');
      expect(console.log).toHaveBeenCalledWith('❌ Condition is false, skipping then block');
      expect(console.log).not.toHaveBeenCalledWith('💬 Should not execute');
    });

    test('should execute nested C-blocks', async () => {
      // Create program: repeat 2 times { repeat 2 times { log "Nested" } }
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'repeat1'
          },
          'repeat1': {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            config: { times: 2 },
            slotHeads: { DO: 'repeat2' }
          },
          'repeat2': {
            id: 'repeat2',
            kind: 'control.repeat',
            form: 'c',
            config: { times: 2 },
            parent: 'repeat1',
            inSlot: 'DO',
            slotHeads: { DO: 'log1' }
          },
          'log1': {
            id: 'log1',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Nested' },
            parent: 'repeat2',
            inSlot: 'DO'
          }
        }
      };

      await interpreter.run(program);
      
      // Should execute log 4 times (2 * 2)
      const nestedCalls = (console.log as any).mock.calls.filter(
        (call: any[]) => call[0] === '💬 Nested'
      );
      expect(nestedCalls).toHaveLength(4);
    });

    test('should handle multiple independent hat blocks', async () => {
      // Create program with two independent hat blocks
      const program: StackProgram = {
        heads: ['hat1', 'hat2'],
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
            config: { msg: 'First script' }
          },
          'hat2': {
            id: 'hat2',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'log2'
          },
          'log2': {
            id: 'log2',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Second script' }
          }
        }
      };

      await interpreter.run(program);
      
      expect(console.log).toHaveBeenCalledWith('💬 First script');
      expect(console.log).toHaveBeenCalledWith('💬 Second script');
    });
  });

  describe('Serialization and Deserialization of Stack Programs', () => {
    test('should serialize and deserialize simple stack program', async () => {
      const originalProgram = createMockStackProgram({ complexity: 'simple', nodeCount: 4 });
      
      // Validate original structure
      expect(validateStackProgram(originalProgram)).toBe(true);
      
      // Serialize to JSON
      const jsonString = JSON.stringify(originalProgram);
      const parsedProgram: StackProgram = JSON.parse(jsonString);
      
      // Validate schema compliance
      const schemaResult = StackProgramSchema.safeParse(parsedProgram);
      expect(schemaResult.success).toBe(true);
      
      // Validate structure is preserved
      expect(validateStackProgram(parsedProgram)).toBe(true);
      expect(parsedProgram.heads).toEqual(originalProgram.heads);
      expect(Object.keys(parsedProgram.nodes)).toEqual(Object.keys(originalProgram.nodes));
      
      // Validate node properties are preserved
      for (const nodeId of Object.keys(originalProgram.nodes)) {
        const originalNode = originalProgram.nodes[nodeId];
        const parsedNode = parsedProgram.nodes[nodeId];
        
        expect(parsedNode.id).toBe(originalNode.id);
        expect(parsedNode.kind).toBe(originalNode.kind);
        expect(parsedNode.form).toBe(originalNode.form);
        expect(parsedNode.next).toBe(originalNode.next);
        expect(parsedNode.config).toEqual(originalNode.config);
      }
    });

    test('should serialize and deserialize complex nested program', async () => {
      // Create a complex program using registered blocks
      const originalProgram: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'repeat1'
          },
          'repeat1': {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            config: { times: 2 },
            slotHeads: { DO: 'log1' },
            next: 'log2'
          },
          'log1': {
            id: 'log1',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Inside repeat' },
            parent: 'repeat1',
            inSlot: 'DO'
          },
          'log2': {
            id: 'log2',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'After repeat' }
          }
        }
      };
      
      // Execute original program
      const originalInterpreter = new StackInterpreter(registry, {});
      await originalInterpreter.run(originalProgram);
      const originalLogCalls = (console.log as any).mock.calls.length;
      
      // Clear console mock
      vi.clearAllMocks();
      
      // Serialize and deserialize
      const jsonString = JSON.stringify(originalProgram);
      const parsedProgram: StackProgram = JSON.parse(jsonString);
      
      // Execute deserialized program
      const newInterpreter = new StackInterpreter(registry, {});
      await newInterpreter.run(parsedProgram);
      const newLogCalls = (console.log as any).mock.calls.length;
      
      // Should produce same number of console calls
      expect(newLogCalls).toBe(originalLogCalls);
    });

    test('should preserve input values in serialization', async () => {
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'add1'
          },
          'add1': {
            id: 'add1',
            kind: 'op.add',
            form: 'reporter',
            inputs: {
              a: { literal: 42.5 },
              b: { blockId: 'random1' }
            }
          },
          'random1': {
            id: 'random1',
            kind: 'op.random',
            form: 'reporter',
            config: { min: 1, max: 10 }
          }
        }
      };
      
      // Serialize and deserialize
      const jsonString = JSON.stringify(program);
      const parsedProgram: StackProgram = JSON.parse(jsonString);
      
      // Validate input values are preserved
      const parsedAdd = parsedProgram.nodes['add1'];
      expect(parsedAdd.inputs?.a).toEqual({ literal: 42.5 });
      expect(parsedAdd.inputs?.b).toEqual({ blockId: 'random1' });
      
      const parsedRandom = parsedProgram.nodes['random1'];
      expect(parsedRandom.config).toEqual({ min: 1, max: 10 });
    });

    test('should handle serialization of programs with various slot configurations', async () => {
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'repeat1'
          },
          'repeat1': {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            config: { times: 1 },
            slotHeads: { DO: 'if1' },
            next: 'log3'
          },
          'if1': {
            id: 'if1',
            kind: 'control.if',
            form: 'c',
            inputs: { condition: { literal: true } },
            slotHeads: { THEN: 'log1' },
            parent: 'repeat1',
            inSlot: 'DO',
            next: 'log2'
          },
          'log1': {
            id: 'log1',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Inside if' },
            parent: 'if1',
            inSlot: 'THEN'
          },
          'log2': {
            id: 'log2',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'After if' },
            parent: 'repeat1',
            inSlot: 'DO'
          },
          'log3': {
            id: 'log3',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'After repeat' }
          }
        }
      };
      
      // Serialize and deserialize
      const jsonString = JSON.stringify(program);
      const parsedProgram: StackProgram = JSON.parse(jsonString);
      
      // Validate all slot relationships are preserved
      expect(parsedProgram.nodes['repeat1'].slotHeads?.DO).toBe('if1');
      expect(parsedProgram.nodes['if1'].slotHeads?.THEN).toBe('log1');
      expect(parsedProgram.nodes['if1'].parent).toBe('repeat1');
      expect(parsedProgram.nodes['if1'].inSlot).toBe('DO');
      expect(parsedProgram.nodes['log1'].parent).toBe('if1');
      expect(parsedProgram.nodes['log1'].inSlot).toBe('THEN');
    });
  });

  describe('Error Handling in Complex Program Scenarios', () => {
    test('should handle missing block specifications', async () => {
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'non-existent-block',
            form: 'hat'
          }
        }
      };

      await expectToThrowError(
        () => interpreter.run(program),
        'Unknown block: non-existent-block'
      );
    });

    test('should handle malformed program structures', async () => {
      // Program with invalid next reference
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'non-existent-node'
          }
        }
      };

      expect(validateStackProgram(program)).toBe(false);
    });

    test('should handle invalid input references', async () => {
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'add1'
          },
          'add1': {
            id: 'add1',
            kind: 'op.add',
            form: 'reporter',
            inputs: {
              a: { blockId: 'non-existent-block' },
              b: { literal: 5 }
            }
          }
        }
      };

      expect(validateStackProgram(program)).toBe(false);
    });

    test('should handle invalid slot head references', async () => {
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'repeat1'
          },
          'repeat1': {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            config: { times: 1 },
            slotHeads: { DO: 'non-existent-node' }
          }
        }
      };

      expect(validateStackProgram(program)).toBe(false);
    });

    test('should handle execution errors in nested blocks gracefully', async () => {
      // Create a program that might cause execution errors
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'add1'
          },
          'add1': {
            id: 'add1',
            kind: 'op.add',
            form: 'reporter',
            inputs: {
              a: { literal: 'not-a-number' }, // Invalid input type
              b: { literal: 5 }
            }
          }
        }
      };

      // Should handle gracefully (DefaultStackBlocks use Number() which converts strings)
      await interpreter.run(program);
      
      // Should log the calculation with NaN handling
      expect(console.log).toHaveBeenCalledWith('🧮 NaN + 5 = NaN'); // Number('not-a-number') becomes NaN
    });

    test('should handle empty slot execution', async () => {
      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          'hat1': {
            id: 'hat1',
            kind: 'event.whenStarted',
            form: 'hat',
            next: 'repeat1'
          },
          'repeat1': {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            config: { times: 2 },
            slotHeads: { DO: null } // Empty slot
          }
        }
      };

      // Should execute without errors
      await interpreter.run(program);
      
      expect(console.log).toHaveBeenCalledWith('🔄 Repeating 2 times...');
      // Should still show loop iterations even with empty slot
      expect(console.log).toHaveBeenCalledWith('  Loop 1/2');
      expect(console.log).toHaveBeenCalledWith('  Loop 2/2');
    });

    test('should handle programs with orphaned nodes', async () => {
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
            config: { msg: 'Connected' }
          },
          'orphan1': {
            id: 'orphan1',
            kind: 'looks.log',
            form: 'statement',
            config: { msg: 'Orphaned' }
          }
        }
      };

      await interpreter.run(program);
      
      // Should execute connected nodes but not orphaned ones
      expect(console.log).toHaveBeenCalledWith('💬 Connected');
      expect(console.log).not.toHaveBeenCalledWith('💬 Orphaned');
    });
  });
});