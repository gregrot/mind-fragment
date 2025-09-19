/**
 * Tests for program serialization and deserialization
 */

import { describe, it, expect } from 'vitest';
import { 
  serializeProgram, 
  deserializeProgram, 
  isValidProgramJson, 
  getProgramStats 
} from '../src/StackSerializer';
import { StackProgram, StackBlock } from '../src/types';

describe('StackSerializer', () => {
  // Test program with various block types and nesting
  const testProgram: StackProgram = {
    blocks: [
      {
        id: 'start1',
        kind: 'event.start',
        form: 'hat'
      },
      {
        id: 'say1',
        kind: 'looks.say',
        form: 'statement',
        inputs: {
          TEXT: { literal: 'Hello World!' }
        }
      },
      {
        id: 'repeat1',
        kind: 'control.repeat',
        form: 'c',
        inputs: {
          TIMES: { literal: 3 }
        },
        slots: {
          DO: [
            {
              id: 'wait1',
              kind: 'control.wait',
              form: 'statement',
              inputs: {
                DURATION: { literal: 1 }
              }
            },
            {
              id: 'nested_repeat',
              kind: 'control.repeat',
              form: 'c',
              inputs: {
                TIMES: { literal: 2 }
              },
              slots: {
                DO: [
                  {
                    id: 'nested_say',
                    kind: 'looks.say',
                    form: 'statement',
                    inputs: {
                      TEXT: { literal: 'Nested!' }
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    ]
  };

  describe('serializeProgram', () => {
    it('should serialize a program to valid JSON', () => {
      const json = serializeProgram(testProgram);
      
      // Should be valid JSON
      expect(() => JSON.parse(json)).not.toThrow();
      
      // Should contain version and program data
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.program).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    });

    it('should preserve all program structure', () => {
      const json = serializeProgram(testProgram);
      const parsed = JSON.parse(json);
      
      // Check top-level blocks
      expect(parsed.program.blocks).toHaveLength(3);
      expect(parsed.program.blocks[0].id).toBe('start1');
      expect(parsed.program.blocks[1].id).toBe('say1');
      expect(parsed.program.blocks[2].id).toBe('repeat1');
      
      // Check inputs are preserved
      expect(parsed.program.blocks[1].inputs.TEXT.literal).toBe('Hello World!');
      expect(parsed.program.blocks[2].inputs.TIMES.literal).toBe(3);
      
      // Check nested structure is preserved
      const repeatBlock = parsed.program.blocks[2];
      expect(repeatBlock.slots.DO).toHaveLength(2);
      expect(repeatBlock.slots.DO[0].id).toBe('wait1');
      expect(repeatBlock.slots.DO[1].id).toBe('nested_repeat');
      
      // Check deeply nested structure
      const nestedRepeat = repeatBlock.slots.DO[1];
      expect(nestedRepeat.slots.DO).toHaveLength(1);
      expect(nestedRepeat.slots.DO[0].id).toBe('nested_say');
      expect(nestedRepeat.slots.DO[0].inputs.TEXT.literal).toBe('Nested!');
    });

    it('should handle empty programs', () => {
      const emptyProgram: StackProgram = { blocks: [] };
      const json = serializeProgram(emptyProgram);
      
      const parsed = JSON.parse(json);
      expect(parsed.program.blocks).toHaveLength(0);
    });
  });

  describe('deserializeProgram', () => {
    it('should deserialize a serialized program correctly', () => {
      const json = serializeProgram(testProgram);
      const deserialized = deserializeProgram(json);
      
      // Should match original structure
      expect(deserialized.blocks).toHaveLength(3);
      expect(deserialized.blocks[0].id).toBe('start1');
      expect(deserialized.blocks[1].inputs?.TEXT).toEqual({ literal: 'Hello World!' });
      
      // Check nested structure
      const repeatBlock = deserialized.blocks[2];
      expect(repeatBlock.slots?.DO).toHaveLength(2);
      expect(repeatBlock.slots?.DO[1].slots?.DO[0].inputs?.TEXT).toEqual({ literal: 'Nested!' });
    });

    it('should handle legacy format (direct program object)', () => {
      const legacyJson = JSON.stringify(testProgram);
      const deserialized = deserializeProgram(legacyJson);
      
      expect(deserialized.blocks).toHaveLength(3);
      expect(deserialized.blocks[0].id).toBe('start1');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => deserializeProgram('invalid json')).toThrow('Invalid JSON format');
    });

    it('should throw error for missing blocks array', () => {
      const invalidProgram = JSON.stringify({ notBlocks: [] });
      expect(() => deserializeProgram(invalidProgram)).toThrow('Invalid program format');
    });

    it('should validate block structure', () => {
      const invalidBlock = {
        blocks: [
          {
            // Missing required fields
            kind: 'test'
          }
        ]
      };
      
      expect(() => deserializeProgram(JSON.stringify(invalidBlock))).toThrow();
    });

    it('should validate input structure', () => {
      const invalidInputs = {
        blocks: [
          {
            id: 'test1',
            kind: 'test',
            form: 'statement',
            inputs: {
              INVALID: { neither: 'literal nor blockId' }
            }
          }
        ]
      };
      
      expect(() => deserializeProgram(JSON.stringify(invalidInputs))).toThrow();
    });
  });

  describe('isValidProgramJson', () => {
    it('should return true for valid program JSON', () => {
      const json = serializeProgram(testProgram);
      expect(isValidProgramJson(json)).toBe(true);
    });

    it('should return false for invalid JSON', () => {
      expect(isValidProgramJson('invalid json')).toBe(false);
    });

    it('should return false for valid JSON but invalid program', () => {
      const invalidProgram = JSON.stringify({ notAProgram: true });
      expect(isValidProgramJson(invalidProgram)).toBe(false);
    });
  });

  describe('getProgramStats', () => {
    it('should calculate correct statistics', () => {
      const stats = getProgramStats(testProgram);
      
      expect(stats.totalBlocks).toBe(6); // 3 top-level + 3 nested
      expect(stats.blocksByForm.hat).toBe(1);
      expect(stats.blocksByForm.statement).toBe(3);
      expect(stats.blocksByForm.c).toBe(2);
      expect(stats.maxNestingDepth).toBe(3); // start -> repeat -> nested_repeat -> nested_say
    });

    it('should handle empty programs', () => {
      const stats = getProgramStats({ blocks: [] });
      
      expect(stats.totalBlocks).toBe(0);
      expect(stats.maxNestingDepth).toBe(0);
      expect(Object.keys(stats.blocksByForm)).toHaveLength(0);
    });
  });

  describe('round-trip serialization', () => {
    it('should preserve program identity through serialize/deserialize cycle', () => {
      const json = serializeProgram(testProgram);
      const deserialized = deserializeProgram(json);
      const reserializedJson = serializeProgram(deserialized);
      const reDeserialized = deserializeProgram(reserializedJson);
      
      // Programs should be structurally identical
      expect(reDeserialized.blocks).toEqual(deserialized.blocks);
    });

    it('should handle programs with block references', () => {
      const programWithRefs: StackProgram = {
        blocks: [
          {
            id: 'reporter1',
            kind: 'math.number',
            form: 'reporter',
            inputs: {
              VALUE: { literal: 42 }
            }
          },
          {
            id: 'consumer1',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { blockId: 'reporter1' }
            }
          }
        ]
      };
      
      const json = serializeProgram(programWithRefs);
      const deserialized = deserializeProgram(json);
      
      expect(deserialized.blocks[1].inputs?.TEXT).toEqual({ blockId: 'reporter1' });
    });
  });
});