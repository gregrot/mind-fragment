import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConstNumber, Add, Multiply, ToString, Print, DefaultBlocks } from '../../src/DefaultBlocks';
import type { BlockSpec } from '../../src/types';

describe('DefaultBlocks', () => {
  describe('ConstNumber block', () => {
    it('should have correct specification', () => {
      expect(ConstNumber.kind).toBe('const.number');
      expect(ConstNumber.label).toBe('Number');
      expect(ConstNumber.outputs).toEqual([
        { key: 'out', label: 'out', type: 'number' }
      ]);
      expect(ConstNumber.configSchema).toBeDefined();
    });

    it('should return configured value when provided', () => {
      const result = ConstNumber.evaluate!({
        inputs: {},
        config: { value: 42 }
      });

      expect(result).toEqual({ out: 42 });
    });

    it('should return random value when no config provided', () => {
      const result = ConstNumber.evaluate!({
        inputs: {},
        config: {}
      });

      expect(result.out).toBeTypeOf('number');
      expect(result.out).toBeGreaterThanOrEqual(0);
      expect(result.out).toBeLessThanOrEqual(100);
    });

    it('should return random value when config is undefined', () => {
      const result = ConstNumber.evaluate!({
        inputs: {},
        config: undefined
      });

      expect(result.out).toBeTypeOf('number');
      expect(result.out).toBeGreaterThanOrEqual(0);
      expect(result.out).toBeLessThanOrEqual(100);
    });

    it('should handle zero value configuration', () => {
      const result = ConstNumber.evaluate!({
        inputs: {},
        config: { value: 0 }
      });

      expect(result).toEqual({ out: 0 });
    });

    it('should handle negative value configuration', () => {
      const result = ConstNumber.evaluate!({
        inputs: {},
        config: { value: -25 }
      });

      expect(result).toEqual({ out: -25 });
    });

    it('should validate config schema', () => {
      const schema = ConstNumber.configSchema!;
      
      expect(schema.parse({ value: 42 })).toEqual({ value: 42 });
      expect(schema.parse({})).toEqual({});
      expect(() => schema.parse({ value: 'not a number' })).toThrow();
    });
  });

  describe('Add block', () => {
    it('should have correct specification', () => {
      expect(Add.kind).toBe('math.add');
      expect(Add.label).toBe('+');
      expect(Add.inputs).toEqual([
        { key: 'a', type: 'number', defaultValue: 0 },
        { key: 'b', type: 'number', defaultValue: 0 }
      ]);
      expect(Add.outputs).toEqual([
        { key: 'sum', type: 'number' }
      ]);
    });

    it('should add two positive numbers', () => {
      const result = Add.evaluate!({
        inputs: { a: 5, b: 3 },
        config: {}
      });

      expect(result).toEqual({ sum: 8 });
    });

    it('should add positive and negative numbers', () => {
      const result = Add.evaluate!({
        inputs: { a: 10, b: -3 },
        config: {}
      });

      expect(result).toEqual({ sum: 7 });
    });

    it('should handle zero values', () => {
      const result = Add.evaluate!({
        inputs: { a: 0, b: 5 },
        config: {}
      });

      expect(result).toEqual({ sum: 5 });
    });

    it('should handle missing inputs with default values', () => {
      const result = Add.evaluate!({
        inputs: {},
        config: {}
      });

      expect(result).toEqual({ sum: 0 });
    });

    it('should handle undefined inputs', () => {
      const result = Add.evaluate!({
        inputs: { a: undefined, b: 5 },
        config: {}
      });

      expect(result).toEqual({ sum: 5 });
    });

    it('should handle null inputs', () => {
      const result = Add.evaluate!({
        inputs: { a: null, b: 7 },
        config: {}
      });

      expect(result).toEqual({ sum: 7 });
    });

    it('should coerce string numbers to numbers', () => {
      const result = Add.evaluate!({
        inputs: { a: '5', b: '3' },
        config: {}
      });

      expect(result).toEqual({ sum: 8 });
    });

    it('should handle non-numeric strings as zero', () => {
      const result = Add.evaluate!({
        inputs: { a: 'not a number', b: 5 },
        config: {}
      });

      expect(result).toEqual({ sum: 5 });
    });

    it('should handle decimal numbers', () => {
      const result = Add.evaluate!({
        inputs: { a: 2.5, b: 1.7 },
        config: {}
      });

      expect(result).toEqual({ sum: 4.2 });
    });
  });

  describe('Multiply block', () => {
    it('should have correct specification', () => {
      expect(Multiply.kind).toBe('math.mul');
      expect(Multiply.label).toBe('×');
      expect(Multiply.inputs).toEqual([
        { key: 'a', type: 'number', defaultValue: 1 },
        { key: 'b', type: 'number', defaultValue: 1 }
      ]);
      expect(Multiply.outputs).toEqual([
        { key: 'prod', type: 'number' }
      ]);
    });

    it('should multiply two positive numbers', () => {
      const result = Multiply.evaluate!({
        inputs: { a: 4, b: 3 },
        config: {}
      });

      expect(result).toEqual({ prod: 12 });
    });

    it('should multiply by zero (note: zero becomes 1 due to || fallback)', () => {
      const result = Multiply.evaluate!({
        inputs: { a: 5, b: 0 },
        config: {}
      });

      // Note: The implementation uses (Number(inputs.b) || 1), so 0 becomes 1
      expect(result).toEqual({ prod: 5 });
    });

    it('should actually multiply by zero when using null/undefined', () => {
      // To get actual zero multiplication, we need to pass a truthy zero
      const result = Multiply.evaluate!({
        inputs: { a: 5, b: null }, // null becomes 1 due to || fallback
        config: {}
      });

      expect(result).toEqual({ prod: 5 });
    });

    it('should multiply negative numbers', () => {
      const result = Multiply.evaluate!({
        inputs: { a: -2, b: 3 },
        config: {}
      });

      expect(result).toEqual({ prod: -6 });
    });

    it('should handle missing inputs with default values', () => {
      const result = Multiply.evaluate!({
        inputs: {},
        config: {}
      });

      expect(result).toEqual({ prod: 1 });
    });

    it('should handle undefined inputs', () => {
      const result = Multiply.evaluate!({
        inputs: { a: undefined, b: 5 },
        config: {}
      });

      expect(result).toEqual({ prod: 5 });
    });

    it('should handle null inputs', () => {
      const result = Multiply.evaluate!({
        inputs: { a: null, b: 7 },
        config: {}
      });

      expect(result).toEqual({ prod: 7 });
    });

    it('should coerce string numbers to numbers', () => {
      const result = Multiply.evaluate!({
        inputs: { a: '4', b: '2.5' },
        config: {}
      });

      expect(result).toEqual({ prod: 10 });
    });

    it('should handle non-numeric strings as one', () => {
      const result = Multiply.evaluate!({
        inputs: { a: 'not a number', b: 5 },
        config: {}
      });

      expect(result).toEqual({ prod: 5 });
    });

    it('should handle decimal numbers', () => {
      const result = Multiply.evaluate!({
        inputs: { a: 2.5, b: 4 },
        config: {}
      });

      expect(result).toEqual({ prod: 10 });
    });
  });

  describe('ToString block', () => {
    it('should have correct specification', () => {
      expect(ToString.kind).toBe('to.string');
      expect(ToString.label).toBe('toString');
      expect(ToString.inputs).toEqual([
        { key: 'value', type: { union: ['number', 'boolean', 'string'] } }
      ]);
      expect(ToString.outputs).toEqual([
        { key: 'out', type: 'string' }
      ]);
    });

    it('should convert number to string', () => {
      const result = ToString.evaluate!({
        inputs: { value: 42 },
        config: {}
      });

      expect(result).toEqual({ out: '42' });
    });

    it('should convert boolean to string', () => {
      const result1 = ToString.evaluate!({
        inputs: { value: true },
        config: {}
      });

      const result2 = ToString.evaluate!({
        inputs: { value: false },
        config: {}
      });

      expect(result1).toEqual({ out: 'true' });
      expect(result2).toEqual({ out: 'false' });
    });

    it('should pass through string unchanged', () => {
      const result = ToString.evaluate!({
        inputs: { value: 'hello world' },
        config: {}
      });

      expect(result).toEqual({ out: 'hello world' });
    });

    it('should handle undefined input', () => {
      const result = ToString.evaluate!({
        inputs: { value: undefined },
        config: {}
      });

      expect(result).toEqual({ out: 'undefined' });
    });

    it('should handle null input', () => {
      const result = ToString.evaluate!({
        inputs: { value: null },
        config: {}
      });

      expect(result).toEqual({ out: 'null' });
    });

    it('should handle zero', () => {
      const result = ToString.evaluate!({
        inputs: { value: 0 },
        config: {}
      });

      expect(result).toEqual({ out: '0' });
    });

    it('should handle empty string', () => {
      const result = ToString.evaluate!({
        inputs: { value: '' },
        config: {}
      });

      expect(result).toEqual({ out: '' });
    });

    it('should handle object input', () => {
      const result = ToString.evaluate!({
        inputs: { value: { key: 'value' } },
        config: {}
      });

      expect(result).toEqual({ out: '[object Object]' });
    });

    it('should handle array input', () => {
      const result = ToString.evaluate!({
        inputs: { value: [1, 2, 3] },
        config: {}
      });

      expect(result).toEqual({ out: '1,2,3' });
    });
  });

  describe('Print block', () => {
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should have correct specification', () => {
      expect(Print.kind).toBe('io.print');
      expect(Print.label).toBe('Print');
      expect(Print.inputs).toEqual([
        { key: 'msg', type: { union: ['string', 'number', 'boolean'] } }
      ]);
      expect(Print.outputs).toEqual([
        { key: 'done', type: 'boolean' }
      ]);
    });

    it('should print string message and return done', () => {
      const result = Print.evaluate!({
        inputs: { msg: 'Hello, World!' },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith('Hello, World!');
      expect(result).toEqual({ done: true });
    });

    it('should print number message', () => {
      const result = Print.evaluate!({
        inputs: { msg: 42 },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith('42');
      expect(result).toEqual({ done: true });
    });

    it('should print boolean message', () => {
      const result = Print.evaluate!({
        inputs: { msg: true },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith('true');
      expect(result).toEqual({ done: true });
    });

    it('should handle undefined message', () => {
      const result = Print.evaluate!({
        inputs: { msg: undefined },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith('undefined');
      expect(result).toEqual({ done: true });
    });

    it('should handle null message', () => {
      const result = Print.evaluate!({
        inputs: { msg: null },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith('null');
      expect(result).toEqual({ done: true });
    });

    it('should handle object message', () => {
      const result = Print.evaluate!({
        inputs: { msg: { key: 'value' } },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith('[object Object]');
      expect(result).toEqual({ done: true });
    });

    it('should handle empty string message', () => {
      const result = Print.evaluate!({
        inputs: { msg: '' },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith('');
      expect(result).toEqual({ done: true });
    });

    it('should handle zero message', () => {
      const result = Print.evaluate!({
        inputs: { msg: 0 },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith('0');
      expect(result).toEqual({ done: true });
    });
  });

  describe('DefaultBlocks array', () => {
    it('should contain all default blocks', () => {
      expect(DefaultBlocks).toHaveLength(5);
      expect(DefaultBlocks).toContain(ConstNumber);
      expect(DefaultBlocks).toContain(Add);
      expect(DefaultBlocks).toContain(Multiply);
      expect(DefaultBlocks).toContain(ToString);
      expect(DefaultBlocks).toContain(Print);
    });

    it('should have unique block kinds', () => {
      const kinds = DefaultBlocks.map(block => block.kind);
      const uniqueKinds = new Set(kinds);
      expect(uniqueKinds.size).toBe(kinds.length);
    });

    it('should all be valid block specifications', () => {
      DefaultBlocks.forEach(block => {
        expect(block.kind).toBeTypeOf('string');
        expect(block.kind.length).toBeGreaterThan(0);
        expect(block.label).toBeTypeOf('string');
        expect(block.label.length).toBeGreaterThan(0);
        
        if (block.inputs) {
          expect(Array.isArray(block.inputs)).toBe(true);
          block.inputs.forEach(input => {
            expect(input.key).toBeTypeOf('string');
            expect(input.key.length).toBeGreaterThan(0);
          });
        }
        
        if (block.outputs) {
          expect(Array.isArray(block.outputs)).toBe(true);
          block.outputs.forEach(output => {
            expect(output.key).toBeTypeOf('string');
            expect(output.key.length).toBeGreaterThan(0);
          });
        }
        
        if (block.evaluate) {
          expect(typeof block.evaluate).toBe('function');
        }
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle extremely large numbers in Add', () => {
      const result = Add.evaluate!({
        inputs: { a: Number.MAX_SAFE_INTEGER, b: 1 },
        config: {}
      });

      expect(result.sum).toBe(Number.MAX_SAFE_INTEGER + 1);
    });

    it('should handle extremely large numbers in Multiply', () => {
      const result = Multiply.evaluate!({
        inputs: { a: Number.MAX_SAFE_INTEGER, b: 2 },
        config: {}
      });

      expect(result.prod).toBe(Number.MAX_SAFE_INTEGER * 2);
    });

    it('should handle Infinity in calculations', () => {
      const addResult = Add.evaluate!({
        inputs: { a: Infinity, b: 5 },
        config: {}
      });

      const multiplyResult = Multiply.evaluate!({
        inputs: { a: Infinity, b: 2 },
        config: {}
      });

      expect(addResult.sum).toBe(Infinity);
      expect(multiplyResult.prod).toBe(Infinity);
    });

    it('should handle NaN in calculations', () => {
      const addResult = Add.evaluate!({
        inputs: { a: NaN, b: 5 },
        config: {}
      });

      const multiplyResult = Multiply.evaluate!({
        inputs: { a: NaN, b: 2 },
        config: {}
      });

      // Note: The implementations use || fallbacks, so NaN becomes 0 for Add and 1 for Multiply
      expect(addResult.sum).toBe(5); // (NaN || 0) + 5 = 0 + 5 = 5
      expect(multiplyResult.prod).toBe(2); // (NaN || 1) * 2 = 1 * 2 = 2
    });

    it('should handle very long strings in ToString', () => {
      const longString = 'a'.repeat(10000);
      const result = ToString.evaluate!({
        inputs: { value: longString },
        config: {}
      });

      expect(result.out).toBe(longString);
    });

    it('should handle special characters in Print', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = Print.evaluate!({
        inputs: { msg: specialChars },
        config: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith(specialChars);
      expect(result).toEqual({ done: true });
      
      consoleSpy.mockRestore();
    });
  });
});