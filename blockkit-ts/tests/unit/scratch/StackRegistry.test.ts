import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { StackRegistry } from '../../../src/scratch/StackRegistry';
import { StackBlockSpec } from '../../../src/scratch/stackTypes';

describe('StackRegistry', () => {
  let registry: StackRegistry;

  beforeEach(() => {
    registry = new StackRegistry();
  });

  describe('block registration', () => {
    it('should register a valid block spec', () => {
      const spec: StackBlockSpec = {
        kind: 'test-block',
        label: 'Test Block',
        form: 'statement'
      };

      expect(() => registry.register(spec)).not.toThrow();
      expect(registry.get('test-block')).toBe(spec);
    });

    it('should register blocks with different forms', () => {
      const hatSpec: StackBlockSpec = {
        kind: 'hat-block',
        label: 'Hat Block',
        form: 'hat'
      };

      const reporterSpec: StackBlockSpec = {
        kind: 'reporter-block',
        label: 'Reporter Block',
        form: 'reporter'
      };

      const predicateSpec: StackBlockSpec = {
        kind: 'predicate-block',
        label: 'Predicate Block',
        form: 'predicate'
      };

      const cSpec: StackBlockSpec = {
        kind: 'c-block',
        label: 'C Block',
        form: 'c',
        slots: [{ key: 'DO', accepts: 'statement' }]
      };

      registry.register(hatSpec);
      registry.register(reporterSpec);
      registry.register(predicateSpec);
      registry.register(cSpec);

      expect(registry.get('hat-block')).toBe(hatSpec);
      expect(registry.get('reporter-block')).toBe(reporterSpec);
      expect(registry.get('predicate-block')).toBe(predicateSpec);
      expect(registry.get('c-block')).toBe(cSpec);
    });

    it('should register blocks with inputs and configuration schema', () => {
      const configSchema = z.object({
        value: z.number(),
        text: z.string()
      });

      const spec: StackBlockSpec = {
        kind: 'complex-block',
        label: 'Complex Block',
        form: 'reporter',
        inputs: [
          { key: 'input1', type: 'number' },
          { key: 'input2', type: 'string' }
        ],
        configSchema
      };

      registry.register(spec);
      const retrieved = registry.get('complex-block');
      
      expect(retrieved).toBe(spec);
      expect(retrieved?.inputs).toHaveLength(2);
      expect(retrieved?.configSchema).toBe(configSchema);
    });

    it('should allow method chaining', () => {
      const spec1: StackBlockSpec = {
        kind: 'block1',
        label: 'Block 1',
        form: 'statement'
      };

      const spec2: StackBlockSpec = {
        kind: 'block2',
        label: 'Block 2',
        form: 'reporter'
      };

      const result = registry.register(spec1).register(spec2);
      
      expect(result).toBe(registry);
      expect(registry.get('block1')).toBe(spec1);
      expect(registry.get('block2')).toBe(spec2);
    });
  });

  describe('error handling for duplicate kinds', () => {
    it('should throw error when registering duplicate kind', () => {
      const spec1: StackBlockSpec = {
        kind: 'duplicate-kind',
        label: 'First Block',
        form: 'statement'
      };

      const spec2: StackBlockSpec = {
        kind: 'duplicate-kind',
        label: 'Second Block',
        form: 'reporter'
      };

      registry.register(spec1);
      
      expect(() => registry.register(spec2)).toThrow('dup kind duplicate-kind');
    });

    it('should preserve first registration when duplicate is attempted', () => {
      const spec1: StackBlockSpec = {
        kind: 'preserve-test',
        label: 'Original Block',
        form: 'statement'
      };

      const spec2: StackBlockSpec = {
        kind: 'preserve-test',
        label: 'Duplicate Block',
        form: 'reporter'
      };

      registry.register(spec1);
      
      try {
        registry.register(spec2);
      } catch (error) {
        // Expected error
      }

      const retrieved = registry.get('preserve-test');
      expect(retrieved).toBe(spec1);
      expect(retrieved?.label).toBe('Original Block');
    });

    it('should handle case-sensitive kind matching', () => {
      const spec1: StackBlockSpec = {
        kind: 'CaseTest',
        label: 'Upper Case',
        form: 'statement'
      };

      const spec2: StackBlockSpec = {
        kind: 'casetest',
        label: 'Lower Case',
        form: 'statement'
      };

      registry.register(spec1);
      registry.register(spec2); // Should not throw - different cases

      expect(registry.get('CaseTest')).toBe(spec1);
      expect(registry.get('casetest')).toBe(spec2);
    });
  });

  describe('block retrieval', () => {
    beforeEach(() => {
      const specs: StackBlockSpec[] = [
        { kind: 'block1', label: 'Block 1', form: 'hat' },
        { kind: 'block2', label: 'Block 2', form: 'statement' },
        { kind: 'block3', label: 'Block 3', form: 'reporter' }
      ];

      specs.forEach(spec => registry.register(spec));
    });

    it('should retrieve registered blocks by kind', () => {
      const block1 = registry.get('block1');
      const block2 = registry.get('block2');
      const block3 = registry.get('block3');

      expect(block1?.kind).toBe('block1');
      expect(block1?.form).toBe('hat');
      expect(block2?.kind).toBe('block2');
      expect(block2?.form).toBe('statement');
      expect(block3?.kind).toBe('block3');
      expect(block3?.form).toBe('reporter');
    });

    it('should return undefined for non-existent kinds', () => {
      expect(registry.get('non-existent')).toBeUndefined();
      expect(registry.get('')).toBeUndefined();
      expect(registry.get('BLOCK1')).toBeUndefined(); // Case sensitive
    });

    it('should handle special characters in kind names', () => {
      const spec: StackBlockSpec = {
        kind: 'block-with_special.chars',
        label: 'Special Block',
        form: 'statement'
      };

      registry.register(spec);
      expect(registry.get('block-with_special.chars')).toBe(spec);
    });
  });

  describe('registry enumeration and validation', () => {
    it('should return empty array when no blocks are registered', () => {
      expect(registry.all()).toEqual([]);
    });

    it('should return all registered blocks', () => {
      const specs: StackBlockSpec[] = [
        { kind: 'hat1', label: 'Hat 1', form: 'hat' },
        { kind: 'statement1', label: 'Statement 1', form: 'statement' },
        { kind: 'reporter1', label: 'Reporter 1', form: 'reporter' },
        { kind: 'predicate1', label: 'Predicate 1', form: 'predicate' },
        { kind: 'c1', label: 'C Block 1', form: 'c', slots: [{ key: 'DO' }] }
      ];

      specs.forEach(spec => registry.register(spec));
      const allBlocks = registry.all();

      expect(allBlocks).toHaveLength(5);
      expect(allBlocks).toEqual(expect.arrayContaining(specs));
    });

    it('should return blocks in registration order', () => {
      const spec1: StackBlockSpec = { kind: 'first', label: 'First', form: 'statement' };
      const spec2: StackBlockSpec = { kind: 'second', label: 'Second', form: 'reporter' };
      const spec3: StackBlockSpec = { kind: 'third', label: 'Third', form: 'hat' };

      registry.register(spec1);
      registry.register(spec2);
      registry.register(spec3);

      const allBlocks = registry.all();
      expect(allBlocks[0]).toBe(spec1);
      expect(allBlocks[1]).toBe(spec2);
      expect(allBlocks[2]).toBe(spec3);
    });

    it('should validate that all returned blocks have required properties', () => {
      const specs: StackBlockSpec[] = [
        { 
          kind: 'complete-block', 
          label: 'Complete Block', 
          form: 'c',
          inputs: [{ key: 'input1', type: 'number' }],
          slots: [{ key: 'DO', accepts: 'statement', label: 'do' }],
          configSchema: z.object({ value: z.number() })
        }
      ];

      specs.forEach(spec => registry.register(spec));
      const allBlocks = registry.all();

      allBlocks.forEach(block => {
        expect(block).toHaveProperty('kind');
        expect(block).toHaveProperty('label');
        expect(block).toHaveProperty('form');
        expect(typeof block.kind).toBe('string');
        expect(typeof block.label).toBe('string');
        expect(['hat', 'statement', 'c', 'reporter', 'predicate']).toContain(block.form);
      });
    });

    it('should handle registry with mixed block types', () => {
      const hatBlock: StackBlockSpec = { kind: 'hat', label: 'Hat', form: 'hat' };
      const statementBlock: StackBlockSpec = { kind: 'stmt', label: 'Statement', form: 'statement' };
      const cBlock: StackBlockSpec = { 
        kind: 'c', 
        label: 'C Block', 
        form: 'c',
        slots: [{ key: 'DO' }]
      };
      const reporterBlock: StackBlockSpec = { 
        kind: 'rep', 
        label: 'Reporter', 
        form: 'reporter',
        inputs: [{ key: 'value', type: 'any' }]
      };

      registry.register(hatBlock);
      registry.register(statementBlock);
      registry.register(cBlock);
      registry.register(reporterBlock);

      const allBlocks = registry.all();
      const forms = allBlocks.map(block => block.form);
      
      expect(forms).toContain('hat');
      expect(forms).toContain('statement');
      expect(forms).toContain('c');
      expect(forms).toContain('reporter');
      expect(allBlocks).toHaveLength(4);
    });
  });
});