import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  WhenStarted, 
  Repeat, 
  If, 
  Log, 
  Wait, 
  Add, 
  Random, 
  GreaterThan,
  DefaultStackBlocks 
} from '../../../src/scratch/DefaultStackBlocks';
import { ExecCtx } from '../../../src/scratch/stackTypes';

describe('DefaultStackBlocks', () => {
  let mockGetInput: ReturnType<typeof vi.fn>;
  let mockRunSlot: ReturnType<typeof vi.fn>;
  let mockState: Record<string, unknown>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockGetInput = vi.fn();
    mockRunSlot = vi.fn();
    mockState = {};
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('WhenStarted block', () => {
    it('should have correct block specification', () => {
      expect(WhenStarted.kind).toBe('event.whenStarted');
      expect(WhenStarted.label).toBe('when started');
      expect(WhenStarted.form).toBe('hat');
      expect(WhenStarted.slots).toEqual([{ key: 'DO', label: 'do' }]);
    });

    it('should execute DO slot when started', async () => {
      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      await WhenStarted.execute!(ctx);

      expect(mockRunSlot).toHaveBeenCalledWith('DO');
      expect(consoleSpy).toHaveBeenCalledWith('🚀 Starting script...');
    });

    it('should handle missing execute function gracefully', () => {
      expect(WhenStarted.execute).toBeDefined();
    });
  });

  describe('Repeat block', () => {
    it('should have correct block specification', () => {
      expect(Repeat.kind).toBe('control.repeat');
      expect(Repeat.label).toBe('repeat 10 times');
      expect(Repeat.form).toBe('c');
      expect(Repeat.slots).toEqual([{ key: 'DO', label: 'do' }]);
    });

    it('should repeat default 10 times when no config provided', async () => {
      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      await Repeat.execute!(ctx);

      expect(mockRunSlot).toHaveBeenCalledTimes(10);
      expect(mockRunSlot).toHaveBeenCalledWith('DO');
      expect(consoleSpy).toHaveBeenCalledWith('🔄 Repeating 10 times...');
    });

    it('should repeat specified number of times from config', async () => {
      const ctx: ExecCtx<{ times: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { times: 5 }
      };

      await Repeat.execute!(ctx);

      expect(mockRunSlot).toHaveBeenCalledTimes(5);
      expect(consoleSpy).toHaveBeenCalledWith('🔄 Repeating 5 times...');
      expect(consoleSpy).toHaveBeenCalledWith('  Loop 1/5');
      expect(consoleSpy).toHaveBeenCalledWith('  Loop 5/5');
    });

    it('should handle zero repetitions', async () => {
      const ctx: ExecCtx<{ times: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { times: 0 }
      };

      await Repeat.execute!(ctx);

      expect(mockRunSlot).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('🔄 Repeating 0 times...');
    });

    it('should handle negative repetitions as zero', async () => {
      const ctx: ExecCtx<{ times: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { times: -5 }
      };

      await Repeat.execute!(ctx);

      expect(mockRunSlot).not.toHaveBeenCalled();
    });
  });

  describe('If block', () => {
    it('should have correct block specification', () => {
      expect(If.kind).toBe('control.if');
      expect(If.label).toBe('if');
      expect(If.form).toBe('c');
      expect(If.inputs).toEqual([{ key: 'condition', type: 'boolean' }]);
      expect(If.slots).toEqual([{ key: 'THEN', label: 'then' }]);
    });

    it('should execute THEN slot when condition is true', async () => {
      mockGetInput.mockResolvedValue(true);

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      await If.execute!(ctx);

      expect(mockGetInput).toHaveBeenCalledWith('condition');
      expect(mockRunSlot).toHaveBeenCalledWith('THEN');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Condition is true, executing then block');
    });

    it('should not execute THEN slot when condition is false', async () => {
      mockGetInput.mockResolvedValue(false);

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      await If.execute!(ctx);

      expect(mockGetInput).toHaveBeenCalledWith('condition');
      expect(mockRunSlot).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('❌ Condition is false, skipping then block');
    });

    it('should handle falsy values as false', async () => {
      const falsyValues = [null, undefined, 0, '', NaN];

      for (const falsyValue of falsyValues) {
        mockGetInput.mockResolvedValue(falsyValue);
        mockRunSlot.mockClear();

        const ctx: ExecCtx<any> = {
          getInput: mockGetInput,
          runSlot: mockRunSlot,
          state: mockState,
          config: undefined
        };

        await If.execute!(ctx);
        expect(mockRunSlot).not.toHaveBeenCalled();
      }
    });

    it('should handle truthy values as true', async () => {
      const truthyValues = [1, 'hello', [], {}, 'false'];

      for (const truthyValue of truthyValues) {
        mockGetInput.mockResolvedValue(truthyValue);
        mockRunSlot.mockClear();

        const ctx: ExecCtx<any> = {
          getInput: mockGetInput,
          runSlot: mockRunSlot,
          state: mockState,
          config: undefined
        };

        await If.execute!(ctx);
        expect(mockRunSlot).toHaveBeenCalledWith('THEN');
      }
    });
  });

  describe('Log block', () => {
    it('should have correct block specification', () => {
      expect(Log.kind).toBe('looks.log');
      expect(Log.label).toBe('say hello');
      expect(Log.form).toBe('statement');
    });

    it('should log default message when no config provided', async () => {
      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      await Log.execute!(ctx);

      expect(consoleSpy).toHaveBeenCalledWith('💬 Hello, World!');
    });

    it('should log custom message from config', async () => {
      const ctx: ExecCtx<{ msg: string }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { msg: 'Custom message' }
      };

      await Log.execute!(ctx);

      expect(consoleSpy).toHaveBeenCalledWith('💬 Custom message');
    });

    it('should handle empty string message', async () => {
      const ctx: ExecCtx<{ msg: string }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { msg: '' }
      };

      await Log.execute!(ctx);

      expect(consoleSpy).toHaveBeenCalledWith('💬 ');
    });

    it('should handle special characters in message', async () => {
      const specialMessage = 'Hello! @#$%^&*()_+ 🎉';
      const ctx: ExecCtx<{ msg: string }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { msg: specialMessage }
      };

      await Log.execute!(ctx);

      expect(consoleSpy).toHaveBeenCalledWith(`💬 ${specialMessage}`);
    });
  });

  describe('Wait block', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should have correct block specification', () => {
      expect(Wait.kind).toBe('control.wait');
      expect(Wait.label).toBe('wait 1 second');
      expect(Wait.form).toBe('statement');
    });

    it('should wait default 1 second when no config provided', async () => {
      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const waitPromise = Wait.execute!(ctx);
      
      expect(consoleSpy).toHaveBeenCalledWith('⏱️  Waiting 1 second(s)...');
      
      // Fast-forward time
      vi.advanceTimersByTime(1000);
      
      await waitPromise;
    });

    it('should wait specified number of seconds from config', async () => {
      const ctx: ExecCtx<{ seconds: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { seconds: 3 }
      };

      const waitPromise = Wait.execute!(ctx);
      
      expect(consoleSpy).toHaveBeenCalledWith('⏱️  Waiting 3 second(s)...');
      
      // Fast-forward time
      vi.advanceTimersByTime(3000);
      
      await waitPromise;
    });

    it('should handle zero seconds', async () => {
      const ctx: ExecCtx<{ seconds: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { seconds: 0 }
      };

      const waitPromise = Wait.execute!(ctx);
      
      expect(consoleSpy).toHaveBeenCalledWith('⏱️  Waiting 0 second(s)...');
      
      // Even with 0 seconds, setTimeout is still called, so we need to advance timers
      vi.advanceTimersByTime(0);
      
      await waitPromise;
    });

    it('should handle fractional seconds', async () => {
      const ctx: ExecCtx<{ seconds: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { seconds: 0.5 }
      };

      const waitPromise = Wait.execute!(ctx);
      
      expect(consoleSpy).toHaveBeenCalledWith('⏱️  Waiting 0.5 second(s)...');
      
      vi.advanceTimersByTime(500);
      
      await waitPromise;
    });
  });

  describe('Add block', () => {
    it('should have correct block specification', () => {
      expect(Add.kind).toBe('op.add');
      expect(Add.label).toBe('+');
      expect(Add.form).toBe('reporter');
      expect(Add.inputs).toEqual([
        { key: 'a', type: 'number' },
        { key: 'b', type: 'number' }
      ]);
    });

    it('should add two numbers correctly', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return 5;
        if (key === 'b') return 3;
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await Add.execute!(ctx);

      expect(result).toBe(8);
      expect(mockGetInput).toHaveBeenCalledWith('a');
      expect(mockGetInput).toHaveBeenCalledWith('b');
      expect(consoleSpy).toHaveBeenCalledWith('🧮 5 + 3 = 8');
    });

    it('should handle missing inputs as zero', async () => {
      mockGetInput.mockResolvedValue(undefined);

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await Add.execute!(ctx);

      expect(result).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith('🧮 0 + 0 = 0');
    });

    it('should handle string numbers', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return '10';
        if (key === 'b') return '20';
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await Add.execute!(ctx);

      expect(result).toBe(30);
      expect(consoleSpy).toHaveBeenCalledWith('🧮 10 + 20 = 30');
    });

    it('should handle negative numbers', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return -5;
        if (key === 'b') return 3;
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await Add.execute!(ctx);

      expect(result).toBe(-2);
      expect(consoleSpy).toHaveBeenCalledWith('🧮 -5 + 3 = -2');
    });

    it('should handle decimal numbers', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return 1.5;
        if (key === 'b') return 2.7;
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await Add.execute!(ctx);

      expect(result).toBe(4.2);
      expect(consoleSpy).toHaveBeenCalledWith('🧮 1.5 + 2.7 = 4.2');
    });
  });

  describe('Random block', () => {
    it('should have correct block specification', () => {
      expect(Random.kind).toBe('op.random');
      expect(Random.label).toBe('random 1 to 10');
      expect(Random.form).toBe('reporter');
    });

    it('should generate random number in default range 1-10', async () => {
      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await Random.execute!(ctx);

      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
      expect(Number.isInteger(result)).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/🎲 Random number: \d+ \(between 1 and 10\)/));
    });

    it('should generate random number in custom range', async () => {
      const ctx: ExecCtx<{ min: number; max: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { min: 5, max: 15 }
      };

      const result = await Random.execute!(ctx);

      expect(result).toBeGreaterThanOrEqual(5);
      expect(result).toBeLessThanOrEqual(15);
      expect(Number.isInteger(result)).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringMatching(/🎲 Random number: \d+ \(between 5 and 15\)/));
    });

    it('should handle single value range', async () => {
      const ctx: ExecCtx<{ min: number; max: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { min: 7, max: 7 }
      };

      const result = await Random.execute!(ctx);

      expect(result).toBe(7);
      expect(consoleSpy).toHaveBeenCalledWith('🎲 Random number: 7 (between 7 and 7)');
    });

    it('should generate different values on multiple calls', async () => {
      const ctx: ExecCtx<{ min: number; max: number }> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: { min: 1, max: 100 }
      };

      const results = new Set();
      for (let i = 0; i < 20; i++) {
        const result = await Random.execute!(ctx);
        results.add(result);
      }

      // With a range of 1-100 and 20 calls, we should get some variety
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('GreaterThan block', () => {
    it('should have correct block specification', () => {
      expect(GreaterThan.kind).toBe('op.gt');
      expect(GreaterThan.label).toBe('> greater than');
      expect(GreaterThan.form).toBe('predicate');
      expect(GreaterThan.inputs).toEqual([
        { key: 'a', type: 'number' },
        { key: 'b', type: 'number' }
      ]);
    });

    it('should return true when a > b', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return 10;
        if (key === 'b') return 5;
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await GreaterThan.execute!(ctx);

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('🔍 10 > 5 = true');
    });

    it('should return false when a < b', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return 3;
        if (key === 'b') return 8;
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await GreaterThan.execute!(ctx);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('🔍 3 > 8 = false');
    });

    it('should return false when a = b', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return 5;
        if (key === 'b') return 5;
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await GreaterThan.execute!(ctx);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('🔍 5 > 5 = false');
    });

    it('should handle missing inputs as zero', async () => {
      mockGetInput.mockResolvedValue(undefined);

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await GreaterThan.execute!(ctx);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('🔍 0 > 0 = false');
    });

    it('should handle string numbers', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return '15';
        if (key === 'b') return '10';
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await GreaterThan.execute!(ctx);

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('🔍 15 > 10 = true');
    });

    it('should handle negative numbers', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return -2;
        if (key === 'b') return -5;
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await GreaterThan.execute!(ctx);

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('🔍 -2 > -5 = true');
    });

    it('should handle decimal numbers', async () => {
      mockGetInput.mockImplementation(async (key: string) => {
        if (key === 'a') return 3.14;
        if (key === 'b') return 3.15;
        return undefined;
      });

      const ctx: ExecCtx<any> = {
        getInput: mockGetInput,
        runSlot: mockRunSlot,
        state: mockState,
        config: undefined
      };

      const result = await GreaterThan.execute!(ctx);

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('🔍 3.14 > 3.15 = false');
    });
  });

  describe('DefaultStackBlocks array', () => {
    it('should contain all expected blocks', () => {
      expect(DefaultStackBlocks).toHaveLength(8);
      expect(DefaultStackBlocks).toContain(WhenStarted);
      expect(DefaultStackBlocks).toContain(Repeat);
      expect(DefaultStackBlocks).toContain(If);
      expect(DefaultStackBlocks).toContain(Log);
      expect(DefaultStackBlocks).toContain(Wait);
      expect(DefaultStackBlocks).toContain(Add);
      expect(DefaultStackBlocks).toContain(Random);
      expect(DefaultStackBlocks).toContain(GreaterThan);
    });

    it('should have unique kinds for all blocks', () => {
      const kinds = DefaultStackBlocks.map(block => block.kind);
      const uniqueKinds = new Set(kinds);
      expect(uniqueKinds.size).toBe(kinds.length);
    });

    it('should have valid forms for all blocks', () => {
      const validForms = ['hat', 'statement', 'c', 'reporter', 'predicate'];
      DefaultStackBlocks.forEach(block => {
        expect(validForms).toContain(block.form);
      });
    });

    it('should have execute functions for all blocks', () => {
      DefaultStackBlocks.forEach(block => {
        expect(block.execute).toBeDefined();
        expect(typeof block.execute).toBe('function');
      });
    });
  });
});