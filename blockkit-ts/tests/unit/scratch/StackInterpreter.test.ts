import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StackInterpreter } from '../../../src/scratch/StackInterpreter';
import { StackRegistry } from '../../../src/scratch/StackRegistry';
import { StackProgram, StackNode, StackBlockSpec, ExecCtx } from '../../../src/scratch/stackTypes';

describe('StackInterpreter', () => {
  let registry: StackRegistry;
  let interpreter: StackInterpreter;
  let state: Record<string, unknown>;

  beforeEach(() => {
    registry = new StackRegistry();
    state = {};
    interpreter = new StackInterpreter(registry, state);
  });

  describe('execution of different block forms', () => {
    it('should execute hat blocks', async () => {
      const executeMock = vi.fn();
      
      const hatSpec: StackBlockSpec = {
        kind: 'test-hat',
        label: 'Test Hat',
        form: 'hat',
        execute: executeMock
      };

      registry.register(hatSpec);

      const program: StackProgram = {
        heads: ['hat1'],
        nodes: {
          hat1: {
            id: 'hat1',
            kind: 'test-hat',
            form: 'hat'
          }
        }
      };

      await interpreter.run(program);

      expect(executeMock).toHaveBeenCalledOnce();
      expect(executeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          getInput: expect.any(Function),
          runSlot: expect.any(Function),
          state: state,
          config: undefined
        })
      );
    });

    it('should execute statement blocks in sequence', async () => {
      const executeMock1 = vi.fn();
      const executeMock2 = vi.fn();
      
      const statementSpec1: StackBlockSpec = {
        kind: 'statement1',
        label: 'Statement 1',
        form: 'statement',
        execute: executeMock1
      };

      const statementSpec2: StackBlockSpec = {
        kind: 'statement2',
        label: 'Statement 2',
        form: 'statement',
        execute: executeMock2
      };

      registry.register(statementSpec1);
      registry.register(statementSpec2);

      const program: StackProgram = {
        heads: ['stmt1'],
        nodes: {
          stmt1: {
            id: 'stmt1',
            kind: 'statement1',
            form: 'statement',
            next: 'stmt2'
          },
          stmt2: {
            id: 'stmt2',
            kind: 'statement2',
            form: 'statement'
          }
        }
      };

      await interpreter.run(program);

      expect(executeMock1).toHaveBeenCalledBefore(executeMock2);
      expect(executeMock1).toHaveBeenCalledOnce();
      expect(executeMock2).toHaveBeenCalledOnce();
    });

    it('should execute c-blocks with slot handling', async () => {
      const cBlockExecute = vi.fn();
      const slotStatementExecute = vi.fn();
      
      const cBlockSpec: StackBlockSpec = {
        kind: 'repeat',
        label: 'Repeat',
        form: 'c',
        slots: [{ key: 'DO', accepts: 'statement' }],
        execute: cBlockExecute
      };

      const statementSpec: StackBlockSpec = {
        kind: 'say',
        label: 'Say',
        form: 'statement',
        execute: slotStatementExecute
      };

      registry.register(cBlockSpec);
      registry.register(statementSpec);

      const program: StackProgram = {
        heads: ['repeat1'],
        nodes: {
          repeat1: {
            id: 'repeat1',
            kind: 'repeat',
            form: 'c',
            slotHeads: { DO: 'say1' }
          },
          say1: {
            id: 'say1',
            kind: 'say',
            form: 'statement',
            parent: 'repeat1',
            inSlot: 'DO'
          }
        }
      };

      // Mock the c-block to call runSlot
      cBlockExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        await ctx.runSlot('DO');
      });

      await interpreter.run(program);

      expect(cBlockExecute).toHaveBeenCalledOnce();
      expect(slotStatementExecute).toHaveBeenCalledOnce();
    });

    it('should execute reporter blocks and return values', async () => {
      const reporterExecute = vi.fn().mockResolvedValue(42);
      
      const reporterSpec: StackBlockSpec = {
        kind: 'number-reporter',
        label: 'Number',
        form: 'reporter',
        execute: reporterExecute
      };

      const consumerExecute = vi.fn();
      const consumerSpec: StackBlockSpec = {
        kind: 'consumer',
        label: 'Consumer',
        form: 'statement',
        inputs: [{ key: 'value', type: 'number' }],
        execute: consumerExecute
      };

      registry.register(reporterSpec);
      registry.register(consumerSpec);

      // Mock the consumer to actually call getInput to trigger reporter execution
      consumerExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        const value = await ctx.getInput('value');
        expect(value).toBe(42);
      });

      const program: StackProgram = {
        heads: ['consumer1'],
        nodes: {
          consumer1: {
            id: 'consumer1',
            kind: 'consumer',
            form: 'statement',
            inputs: {
              value: { blockId: 'reporter1' }
            }
          },
          reporter1: {
            id: 'reporter1',
            kind: 'number-reporter',
            form: 'reporter'
          }
        }
      };

      await interpreter.run(program);

      expect(reporterExecute).toHaveBeenCalledOnce();
      expect(consumerExecute).toHaveBeenCalledOnce();
    });

    it('should execute predicate blocks and return boolean values', async () => {
      const predicateExecute = vi.fn().mockResolvedValue(true);
      
      const predicateSpec: StackBlockSpec = {
        kind: 'boolean-predicate',
        label: 'Boolean Test',
        form: 'predicate',
        execute: predicateExecute
      };

      const ifExecute = vi.fn();
      const ifSpec: StackBlockSpec = {
        kind: 'if',
        label: 'If',
        form: 'c',
        inputs: [{ key: 'condition', type: 'boolean' }],
        slots: [{ key: 'THEN', accepts: 'statement' }],
        execute: ifExecute
      };

      registry.register(predicateSpec);
      registry.register(ifSpec);

      // Mock the if block to actually call getInput to trigger predicate execution
      ifExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        const condition = await ctx.getInput('condition');
        expect(condition).toBe(true);
      });

      const program: StackProgram = {
        heads: ['if1'],
        nodes: {
          if1: {
            id: 'if1',
            kind: 'if',
            form: 'c',
            inputs: {
              condition: { blockId: 'predicate1' }
            }
          },
          predicate1: {
            id: 'predicate1',
            kind: 'boolean-predicate',
            form: 'predicate'
          }
        }
      };

      await interpreter.run(program);

      expect(predicateExecute).toHaveBeenCalledOnce();
      expect(ifExecute).toHaveBeenCalledOnce();
    });
  });

  describe('slot handling and nested execution', () => {
    it('should handle empty slots gracefully', async () => {
      const cBlockExecute = vi.fn();
      
      const cBlockSpec: StackBlockSpec = {
        kind: 'empty-c',
        label: 'Empty C',
        form: 'c',
        slots: [{ key: 'DO', accepts: 'statement' }],
        execute: cBlockExecute
      };

      registry.register(cBlockSpec);

      const program: StackProgram = {
        heads: ['c1'],
        nodes: {
          c1: {
            id: 'c1',
            kind: 'empty-c',
            form: 'c',
            slotHeads: { DO: null }
          }
        }
      };

      // Mock the c-block to call runSlot on empty slot
      cBlockExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        await ctx.runSlot('DO');
      });

      await expect(interpreter.run(program)).resolves.not.toThrow();
      expect(cBlockExecute).toHaveBeenCalledOnce();
    });

    it('should handle multiple statements in a slot', async () => {
      const cBlockExecute = vi.fn();
      const stmt1Execute = vi.fn();
      const stmt2Execute = vi.fn();
      
      const cBlockSpec: StackBlockSpec = {
        kind: 'multi-c',
        label: 'Multi C',
        form: 'c',
        slots: [{ key: 'DO', accepts: 'statement' }],
        execute: cBlockExecute
      };

      const statementSpec: StackBlockSpec = {
        kind: 'statement',
        label: 'Statement',
        form: 'statement',
        execute: stmt1Execute
      };

      const statement2Spec: StackBlockSpec = {
        kind: 'statement2',
        label: 'Statement 2',
        form: 'statement',
        execute: stmt2Execute
      };

      registry.register(cBlockSpec);
      registry.register(statementSpec);
      registry.register(statement2Spec);

      const program: StackProgram = {
        heads: ['c1'],
        nodes: {
          c1: {
            id: 'c1',
            kind: 'multi-c',
            form: 'c',
            slotHeads: { DO: 'stmt1' }
          },
          stmt1: {
            id: 'stmt1',
            kind: 'statement',
            form: 'statement',
            parent: 'c1',
            inSlot: 'DO',
            next: 'stmt2'
          },
          stmt2: {
            id: 'stmt2',
            kind: 'statement2',
            form: 'statement',
            parent: 'c1',
            inSlot: 'DO'
          }
        }
      };

      cBlockExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        await ctx.runSlot('DO');
      });

      await interpreter.run(program);

      expect(stmt1Execute).toHaveBeenCalledBefore(stmt2Execute);
      expect(stmt1Execute).toHaveBeenCalledOnce();
      expect(stmt2Execute).toHaveBeenCalledOnce();
    });

    it('should handle nested c-blocks', async () => {
      const outerExecute = vi.fn();
      const innerExecute = vi.fn();
      const statementExecute = vi.fn();
      
      const cBlockSpec: StackBlockSpec = {
        kind: 'c-block',
        label: 'C Block',
        form: 'c',
        slots: [{ key: 'DO', accepts: 'statement' }],
        execute: outerExecute
      };

      const innerCSpec: StackBlockSpec = {
        kind: 'inner-c',
        label: 'Inner C',
        form: 'c',
        slots: [{ key: 'DO', accepts: 'statement' }],
        execute: innerExecute
      };

      const statementSpec: StackBlockSpec = {
        kind: 'statement',
        label: 'Statement',
        form: 'statement',
        execute: statementExecute
      };

      registry.register(cBlockSpec);
      registry.register(innerCSpec);
      registry.register(statementSpec);

      const program: StackProgram = {
        heads: ['outer'],
        nodes: {
          outer: {
            id: 'outer',
            kind: 'c-block',
            form: 'c',
            slotHeads: { DO: 'inner' }
          },
          inner: {
            id: 'inner',
            kind: 'inner-c',
            form: 'c',
            parent: 'outer',
            inSlot: 'DO',
            slotHeads: { DO: 'stmt' }
          },
          stmt: {
            id: 'stmt',
            kind: 'statement',
            form: 'statement',
            parent: 'inner',
            inSlot: 'DO'
          }
        }
      };

      outerExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        await ctx.runSlot('DO');
      });

      innerExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        await ctx.runSlot('DO');
      });

      await interpreter.run(program);

      expect(outerExecute).toHaveBeenCalledOnce();
      expect(innerExecute).toHaveBeenCalledOnce();
      expect(statementExecute).toHaveBeenCalledOnce();
    });
  });

  describe('input resolution for literals and nested blocks', () => {
    it('should resolve literal inputs', async () => {
      const executeMock = vi.fn();
      
      const blockSpec: StackBlockSpec = {
        kind: 'literal-consumer',
        label: 'Literal Consumer',
        form: 'statement',
        inputs: [
          { key: 'text', type: 'string' },
          { key: 'number', type: 'number' },
          { key: 'boolean', type: 'boolean' }
        ],
        execute: executeMock
      };

      registry.register(blockSpec);

      const program: StackProgram = {
        heads: ['consumer1'],
        nodes: {
          consumer1: {
            id: 'consumer1',
            kind: 'literal-consumer',
            form: 'statement',
            inputs: {
              text: { literal: 'hello world' },
              number: { literal: 42 },
              boolean: { literal: true }
            }
          }
        }
      };

      await interpreter.run(program);

      expect(executeMock).toHaveBeenCalledOnce();
      const ctx = executeMock.mock.calls[0][0];
      
      expect(await ctx.getInput('text')).toBe('hello world');
      expect(await ctx.getInput('number')).toBe(42);
      expect(await ctx.getInput('boolean')).toBe(true);
    });

    it('should resolve nested reporter blocks', async () => {
      const reporterExecute = vi.fn().mockResolvedValue('nested value');
      const consumerExecute = vi.fn();
      
      const reporterSpec: StackBlockSpec = {
        kind: 'nested-reporter',
        label: 'Nested Reporter',
        form: 'reporter',
        execute: reporterExecute
      };

      const consumerSpec: StackBlockSpec = {
        kind: 'nested-consumer',
        label: 'Nested Consumer',
        form: 'statement',
        inputs: [{ key: 'value', type: 'any' }],
        execute: consumerExecute
      };

      registry.register(reporterSpec);
      registry.register(consumerSpec);

      // Mock the consumer to actually call getInput to trigger reporter execution
      consumerExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        const value = await ctx.getInput('value');
        expect(value).toBe('nested value');
      });

      const program: StackProgram = {
        heads: ['consumer1'],
        nodes: {
          consumer1: {
            id: 'consumer1',
            kind: 'nested-consumer',
            form: 'statement',
            inputs: {
              value: { blockId: 'reporter1' }
            }
          },
          reporter1: {
            id: 'reporter1',
            kind: 'nested-reporter',
            form: 'reporter'
          }
        }
      };

      await interpreter.run(program);

      expect(reporterExecute).toHaveBeenCalledOnce();
      expect(consumerExecute).toHaveBeenCalledOnce();
    });

    it('should handle deeply nested reporter chains', async () => {
      const reporter1Execute = vi.fn().mockResolvedValue(10);
      const reporter2Execute = vi.fn();
      const consumerExecute = vi.fn();
      
      const reporter1Spec: StackBlockSpec = {
        kind: 'base-reporter',
        label: 'Base Reporter',
        form: 'reporter',
        execute: reporter1Execute
      };

      const reporter2Spec: StackBlockSpec = {
        kind: 'chain-reporter',
        label: 'Chain Reporter',
        form: 'reporter',
        inputs: [{ key: 'input', type: 'number' }],
        execute: reporter2Execute
      };

      const consumerSpec: StackBlockSpec = {
        kind: 'chain-consumer',
        label: 'Chain Consumer',
        form: 'statement',
        inputs: [{ key: 'value', type: 'number' }],
        execute: consumerExecute
      };

      registry.register(reporter1Spec);
      registry.register(reporter2Spec);
      registry.register(consumerSpec);

      // Mock reporter2 to double its input
      reporter2Execute.mockImplementation(async (ctx: ExecCtx<any>) => {
        const input = await ctx.getInput('input');
        return (input as number) * 2;
      });

      // Mock the consumer to actually call getInput to trigger the chain
      consumerExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        const value = await ctx.getInput('value');
        expect(value).toBe(20); // 10 * 2
      });

      const program: StackProgram = {
        heads: ['consumer1'],
        nodes: {
          consumer1: {
            id: 'consumer1',
            kind: 'chain-consumer',
            form: 'statement',
            inputs: {
              value: { blockId: 'reporter2' }
            }
          },
          reporter2: {
            id: 'reporter2',
            kind: 'chain-reporter',
            form: 'reporter',
            inputs: {
              input: { blockId: 'reporter1' }
            }
          },
          reporter1: {
            id: 'reporter1',
            kind: 'base-reporter',
            form: 'reporter'
          }
        }
      };

      await interpreter.run(program);

      expect(reporter1Execute).toHaveBeenCalledOnce();
      expect(reporter2Execute).toHaveBeenCalledOnce();
      expect(consumerExecute).toHaveBeenCalledOnce();
    });

    it('should return undefined for missing inputs', async () => {
      const executeMock = vi.fn();
      
      const blockSpec: StackBlockSpec = {
        kind: 'missing-input-test',
        label: 'Missing Input Test',
        form: 'statement',
        inputs: [{ key: 'optional', type: 'any' }],
        execute: executeMock
      };

      registry.register(blockSpec);

      const program: StackProgram = {
        heads: ['test1'],
        nodes: {
          test1: {
            id: 'test1',
            kind: 'missing-input-test',
            form: 'statement'
            // No inputs defined
          }
        }
      };

      await interpreter.run(program);

      expect(executeMock).toHaveBeenCalledOnce();
      const ctx = executeMock.mock.calls[0][0];
      expect(await ctx.getInput('optional')).toBeUndefined();
      expect(await ctx.getInput('nonexistent')).toBeUndefined();
    });
  });

  describe('error handling and execution context management', () => {
    it('should throw error for unknown block kinds', async () => {
      const program: StackProgram = {
        heads: ['unknown1'],
        nodes: {
          unknown1: {
            id: 'unknown1',
            kind: 'unknown-block',
            form: 'statement'
          }
        }
      };

      await expect(interpreter.run(program)).rejects.toThrow('Unknown block: unknown-block');
    });

    it('should handle execution errors gracefully', async () => {
      const errorExecute = vi.fn().mockRejectedValue(new Error('Execution failed'));
      
      const errorSpec: StackBlockSpec = {
        kind: 'error-block',
        label: 'Error Block',
        form: 'statement',
        execute: errorExecute
      };

      registry.register(errorSpec);

      const program: StackProgram = {
        heads: ['error1'],
        nodes: {
          error1: {
            id: 'error1',
            kind: 'error-block',
            form: 'statement'
          }
        }
      };

      await expect(interpreter.run(program)).rejects.toThrow('Execution failed');
    });

    it('should maintain state across block executions', async () => {
      const setterExecute = vi.fn();
      const getterExecute = vi.fn();
      
      const setterSpec: StackBlockSpec = {
        kind: 'state-setter',
        label: 'State Setter',
        form: 'statement',
        execute: setterExecute
      };

      const getterSpec: StackBlockSpec = {
        kind: 'state-getter',
        label: 'State Getter',
        form: 'statement',
        execute: getterExecute
      };

      registry.register(setterSpec);
      registry.register(getterSpec);

      setterExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        ctx.state.testValue = 'shared state';
      });

      getterExecute.mockImplementation(async (ctx: ExecCtx<any>) => {
        expect(ctx.state.testValue).toBe('shared state');
      });

      const program: StackProgram = {
        heads: ['setter1'],
        nodes: {
          setter1: {
            id: 'setter1',
            kind: 'state-setter',
            form: 'statement',
            next: 'getter1'
          },
          getter1: {
            id: 'getter1',
            kind: 'state-getter',
            form: 'statement'
          }
        }
      };

      await interpreter.run(program);

      expect(setterExecute).toHaveBeenCalledOnce();
      expect(getterExecute).toHaveBeenCalledOnce();
    });

    it('should handle multiple program heads sequentially', async () => {
      const execute1 = vi.fn();
      const execute2 = vi.fn();
      
      const spec1: StackBlockSpec = {
        kind: 'head1',
        label: 'Head 1',
        form: 'hat',
        execute: execute1
      };

      const spec2: StackBlockSpec = {
        kind: 'head2',
        label: 'Head 2',
        form: 'hat',
        execute: execute2
      };

      registry.register(spec1);
      registry.register(spec2);

      const program: StackProgram = {
        heads: ['h1', 'h2'],
        nodes: {
          h1: {
            id: 'h1',
            kind: 'head1',
            form: 'hat'
          },
          h2: {
            id: 'h2',
            kind: 'head2',
            form: 'hat'
          }
        }
      };

      await interpreter.run(program);

      expect(execute1).toHaveBeenCalledBefore(execute2);
      expect(execute1).toHaveBeenCalledOnce();
      expect(execute2).toHaveBeenCalledOnce();
    });

    it('should pass configuration to block execution', async () => {
      const executeMock = vi.fn();
      
      const configSpec: StackBlockSpec = {
        kind: 'config-block',
        label: 'Config Block',
        form: 'statement',
        execute: executeMock
      };

      registry.register(configSpec);

      const testConfig = { value: 42, text: 'test' };
      const program: StackProgram = {
        heads: ['config1'],
        nodes: {
          config1: {
            id: 'config1',
            kind: 'config-block',
            form: 'statement',
            config: testConfig
          }
        }
      };

      await interpreter.run(program);

      expect(executeMock).toHaveBeenCalledOnce();
      const ctx = executeMock.mock.calls[0][0];
      expect(ctx.config).toEqual(testConfig);
    });
  });
});