import { describe, it, expect, beforeEach } from 'vitest';
import { BlockRegistry, isTypeCompatible } from '../../src/BlockRegistry';
import type { BlockSpec } from '../../src/types';
import { z } from 'zod';

describe('BlockRegistry', () => {
  let registry: BlockRegistry;

  beforeEach(() => {
    registry = new BlockRegistry();
  });

  describe('block registration', () => {
    it('should register a valid block spec', () => {
      const spec: BlockSpec = {
        kind: 'test.block',
        label: 'Test Block',
        inputs: [{ key: 'input', type: 'number' }],
        outputs: [{ key: 'output', type: 'string' }]
      };

      expect(() => registry.register(spec)).not.toThrow();
      expect(registry.get('test.block')).toBe(spec);
    });

    it('should register a block with config schema', () => {
      const spec: BlockSpec<{ value: number }> = {
        kind: 'test.config',
        label: 'Test Config Block',
        configSchema: z.object({ value: z.number() }),
        outputs: [{ key: 'out', type: 'number' }]
      };

      expect(() => registry.register(spec)).not.toThrow();
      expect(registry.get('test.config')).toBe(spec);
    });

    it('should register a block with evaluate function', () => {
      const spec: BlockSpec = {
        kind: 'test.eval',
        label: 'Test Eval Block',
        inputs: [{ key: 'a', type: 'number' }],
        outputs: [{ key: 'result', type: 'number' }],
        evaluate: ({ inputs }) => ({ result: Number(inputs.a) * 2 })
      };

      expect(() => registry.register(spec)).not.toThrow();
      expect(registry.get('test.eval')).toBe(spec);
    });

    it('should throw error for duplicate block registration', () => {
      const spec1: BlockSpec = {
        kind: 'duplicate.block',
        label: 'First Block'
      };
      const spec2: BlockSpec = {
        kind: 'duplicate.block',
        label: 'Second Block'
      };

      registry.register(spec1);
      expect(() => registry.register(spec2)).toThrow('Block kind already registered: duplicate.block');
    });

    it('should allow chaining registrations', () => {
      const spec1: BlockSpec = { kind: 'block1', label: 'Block 1' };
      const spec2: BlockSpec = { kind: 'block2', label: 'Block 2' };

      const result = registry.register(spec1).register(spec2);
      expect(result).toBe(registry);
      expect(registry.get('block1')).toBe(spec1);
      expect(registry.get('block2')).toBe(spec2);
    });
  });

  describe('block retrieval', () => {
    beforeEach(() => {
      registry.register({ kind: 'test1', label: 'Test 1' });
      registry.register({ kind: 'test2', label: 'Test 2' });
      registry.register({ kind: 'test3', label: 'Test 3' });
    });

    it('should retrieve registered block by kind', () => {
      const block = registry.get('test1');
      expect(block).toBeDefined();
      expect(block?.kind).toBe('test1');
      expect(block?.label).toBe('Test 1');
    });

    it('should return undefined for non-existent block', () => {
      const block = registry.get('non.existent');
      expect(block).toBeUndefined();
    });

    it('should return all registered blocks', () => {
      const allBlocks = registry.all();
      expect(allBlocks).toHaveLength(3);
      expect(allBlocks.map(b => b.kind)).toEqual(['test1', 'test2', 'test3']);
    });

    it('should return empty array when no blocks registered', () => {
      const emptyRegistry = new BlockRegistry();
      expect(emptyRegistry.all()).toEqual([]);
    });
  });
});

describe('isTypeCompatible', () => {
  describe('basic type compatibility', () => {
    it('should return true for identical string types', () => {
      expect(isTypeCompatible('number', 'number')).toBe(true);
      expect(isTypeCompatible('string', 'string')).toBe(true);
      expect(isTypeCompatible('boolean', 'boolean')).toBe(true);
    });

    it('should return false for different string types', () => {
      expect(isTypeCompatible('number', 'string')).toBe(false);
      expect(isTypeCompatible('string', 'boolean')).toBe(false);
      expect(isTypeCompatible('boolean', 'number')).toBe(false);
    });

    it('should return true when either type is "any"', () => {
      expect(isTypeCompatible('any', 'number')).toBe(true);
      expect(isTypeCompatible('string', 'any')).toBe(true);
      expect(isTypeCompatible('any', 'any')).toBe(true);
    });

    it('should return true when either type is undefined', () => {
      expect(isTypeCompatible(undefined, 'number')).toBe(true);
      expect(isTypeCompatible('string', undefined)).toBe(true);
      expect(isTypeCompatible(undefined, undefined)).toBe(true);
    });
  });

  describe('union type compatibility', () => {
    it('should return true for overlapping union types', () => {
      const union1 = { union: ['number', 'string'] as const };
      const union2 = { union: ['string', 'boolean'] as const };
      expect(isTypeCompatible(union1, union2)).toBe(true);
    });

    it('should return false for non-overlapping union types', () => {
      const union1 = { union: ['number'] as const };
      const union2 = { union: ['string', 'boolean'] as const };
      expect(isTypeCompatible(union1, union2)).toBe(false);
    });

    it('should return true when string type matches union member', () => {
      const union = { union: ['number', 'string', 'boolean'] as const };
      expect(isTypeCompatible('number', union)).toBe(true);
      expect(isTypeCompatible(union, 'string')).toBe(true);
    });

    it('should return false when string type does not match union members', () => {
      const union = { union: ['number', 'boolean'] as const };
      expect(isTypeCompatible('string', union)).toBe(false);
      expect(isTypeCompatible(union, 'string')).toBe(false);
    });

    it('should handle complex union combinations', () => {
      const union1 = { union: ['number', 'string'] as const };
      const union2 = { union: ['string', 'boolean'] as const };
      const union3 = { union: ['boolean', 'number'] as const };
      
      expect(isTypeCompatible(union1, union2)).toBe(true); // 'string' overlap
      expect(isTypeCompatible(union2, union3)).toBe(true); // 'boolean' overlap
      expect(isTypeCompatible(union1, union3)).toBe(true); // 'number' overlap
    });

    it('should handle "any" within union types', () => {
      const unionWithAny = { union: ['boolean', 'any'] as const };
      const regularUnion = { union: ['number', 'string'] as const };
      
      // Current implementation: "any" within a union is treated as a regular type
      // It only matches if there's an overlap or if one of the top-level types is "any"
      expect(isTypeCompatible(unionWithAny, regularUnion)).toBe(false); // no overlap
      expect(isTypeCompatible(regularUnion, unionWithAny)).toBe(false); // no overlap
      expect(isTypeCompatible(unionWithAny, 'any')).toBe(true); // top-level "any"
      expect(isTypeCompatible('any', unionWithAny)).toBe(true); // top-level "any"
      expect(isTypeCompatible(unionWithAny, 'boolean')).toBe(true); // 'boolean' overlap
    });
  });

  describe('edge cases', () => {
    it('should handle empty union arrays gracefully', () => {
      const emptyUnion = { union: [] as const };
      expect(isTypeCompatible(emptyUnion, 'number')).toBe(false);
      expect(isTypeCompatible('string', emptyUnion)).toBe(false);
      expect(isTypeCompatible(emptyUnion, emptyUnion)).toBe(false);
    });

    it('should handle single-element unions', () => {
      const singleUnion = { union: ['number'] as const };
      expect(isTypeCompatible(singleUnion, 'number')).toBe(true);
      expect(isTypeCompatible('number', singleUnion)).toBe(true);
      expect(isTypeCompatible(singleUnion, 'string')).toBe(false);
    });
  });
});