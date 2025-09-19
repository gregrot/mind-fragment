/**
 * Tests for program execution validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StackInterpreter } from '../src/StackInterpreter';
import { StackRegistry, createDefaultRegistry } from '../src/StackRegistry';
import { StackProgram, StackBlock, StackBlockSpec } from '../src/types';

describe('StackInterpreter', () => {
  let registry: StackRegistry;
  let interpreter: StackInterpreter;
  let executionLog: string[];

  beforeEach(() => {
    registry = createDefaultRegistry();
    interpreter = new StackInterpreter(registry);
    executionLog = [];

    // Mock console.log to capture execution output
    vi.spyOn(console, 'log').mockImplementation((message: string) => {
      executionLog.push(message);
    });
  });

  describe('Sequential execution of statement blocks', () => {
    it('should execute statement blocks in correct sequence order', async () => {
      const program: StackProgram = {
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
              TEXT: { literal: 'First message' }
            }
          },
          {
            id: 'say2',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { literal: 'Second message' }
            }
          },
          {
            id: 'think1',
            kind: 'looks.think',
            form: 'statement',
            inputs: {
              TEXT: { literal: 'Third message' }
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual([
        'Program started',
        'Say: First message',
        'Say: Second message',
        'Think: Third message'
      ]);
    });

    it('should handle empty programs without errors', async () => {
      const emptyProgram: StackProgram = { blocks: [] };
      
      await expect(interpreter.run(emptyProgram)).resolves.not.toThrow();
      expect(executionLog).toEqual([]);
    });

    it('should continue execution even if one block fails', async () => {
      // Register a block that throws an error
      registry.register({
        kind: 'test.error',
        label: 'error block',
        form: 'statement',
        execute: async () => {
          throw new Error('Test error');
        }
      });

      const program: StackProgram = {
        blocks: [
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: { TEXT: { literal: 'Before error' } }
          },
          {
            id: 'error1',
            kind: 'test.error',
            form: 'statement'
          },
          {
            id: 'say2',
            kind: 'looks.say',
            form: 'statement',
            inputs: { TEXT: { literal: 'After error' } }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual([
        'Say: Before error',
        'Say: After error'
      ]);
    });
  });

  describe('Nested C-block execution with proper slot handling', () => {
    it('should execute nested repeat blocks correctly', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            inputs: {
              TIMES: { literal: 2 }
            },
            slots: {
              DO: [
                {
                  id: 'say1',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: {
                    TEXT: { literal: 'Outer loop' }
                  }
                },
                {
                  id: 'repeat2',
                  kind: 'control.repeat',
                  form: 'c',
                  inputs: {
                    TIMES: { literal: 3 }
                  },
                  slots: {
                    DO: [
                      {
                        id: 'say2',
                        kind: 'looks.say',
                        form: 'statement',
                        inputs: {
                          TEXT: { literal: 'Inner loop' }
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

      await interpreter.run(program);

      // Should execute outer loop 2 times, each containing inner loop 3 times
      const expectedLog = [
        'Say: Outer loop',
        'Say: Inner loop',
        'Say: Inner loop', 
        'Say: Inner loop',
        'Say: Outer loop',
        'Say: Inner loop',
        'Say: Inner loop',
        'Say: Inner loop'
      ];

      expect(executionLog).toEqual(expectedLog);
    });

    it('should handle if-then-else blocks correctly', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'if1',
            kind: 'control.if_else',
            form: 'c',
            inputs: {
              CONDITION: { literal: true }
            },
            slots: {
              THEN: [
                {
                  id: 'say1',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: { TEXT: { literal: 'Condition was true' } }
                }
              ],
              ELSE: [
                {
                  id: 'say2',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: { TEXT: { literal: 'Condition was false' } }
                }
              ]
            }
          },
          {
            id: 'if2',
            kind: 'control.if_else',
            form: 'c',
            inputs: {
              CONDITION: { literal: false }
            },
            slots: {
              THEN: [
                {
                  id: 'say3',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: { TEXT: { literal: 'Should not execute' } }
                }
              ],
              ELSE: [
                {
                  id: 'say4',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: { TEXT: { literal: 'Else branch executed' } }
                }
              ]
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual([
        'Say: Condition was true',
        'Say: Else branch executed'
      ]);
    });

    it('should handle empty slots without errors', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            inputs: {
              TIMES: { literal: 2 }
            },
            slots: {
              DO: [] // Empty slot
            }
          },
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { literal: 'After empty repeat' }
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual(['Say: After empty repeat']);
    });

    it('should handle missing slots without errors', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            inputs: {
              TIMES: { literal: 1 }
            }
            // No slots property
          }
        ]
      };

      await expect(interpreter.run(program)).resolves.not.toThrow();
    });
  });

  describe('Input resolution for reporter blocks and literals', () => {
    it('should resolve literal input values correctly', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { literal: 'Hello World' }
            }
          },
          {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            inputs: {
              TIMES: { literal: 2 }
            },
            slots: {
              DO: [
                {
                  id: 'say2',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: {
                    TEXT: { literal: 'Repeated message' }
                  }
                }
              ]
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual([
        'Say: Hello World',
        'Say: Repeated message',
        'Say: Repeated message'
      ]);
    });

    it('should resolve reporter block references correctly', async () => {
      // Register a simple reporter block for testing
      registry.register({
        kind: 'test.reporter',
        label: 'test value',
        form: 'reporter',
        execute: async () => {
          return { value: 'Reporter result', continue: true };
        }
      });

      const program: StackProgram = {
        blocks: [
          {
            id: 'reporter1',
            kind: 'test.reporter',
            form: 'reporter'
          },
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { blockId: 'reporter1' }
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual(['Say: Reporter result']);
    });

    it('should handle missing input values gracefully', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              // Missing TEXT input
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual(['Say: ']);
    });

    it('should handle missing referenced blocks gracefully', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { blockId: 'nonexistent' }
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual(['Say: ']);
    });

    it('should handle complex nested input resolution', async () => {
      // Register a reporter that returns a number
      registry.register({
        kind: 'math.number',
        label: 'number {}',
        form: 'reporter',
        inputs: [{ key: 'VALUE', type: 'number' }],
        execute: async (ctx) => {
          const value = await ctx.getInput('VALUE');
          return { value: value, continue: true };
        }
      });

      const program: StackProgram = {
        blocks: [
          {
            id: 'number1',
            kind: 'math.number',
            form: 'reporter',
            inputs: {
              VALUE: { literal: 5 }
            }
          },
          {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            inputs: {
              TIMES: { blockId: 'number1' }
            },
            slots: {
              DO: [
                {
                  id: 'say1',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: {
                    TEXT: { literal: 'Count' }
                  }
                }
              ]
            }
          }
        ]
      };

      await interpreter.run(program);

      // Should repeat 5 times based on the reporter block result
      expect(executionLog).toEqual([
        'Say: Count',
        'Say: Count',
        'Say: Count',
        'Say: Count',
        'Say: Count'
      ]);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle unknown block types gracefully', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'unknown1',
            kind: 'unknown.block',
            form: 'statement'
          },
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { literal: 'After unknown block' }
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual(['Say: After unknown block']);
    });

    it('should handle blocks without execute functions', async () => {
      registry.register({
        kind: 'test.noexecute',
        label: 'no execute',
        form: 'statement'
        // No execute function
      });

      const program: StackProgram = {
        blocks: [
          {
            id: 'noexec1',
            kind: 'test.noexecute',
            form: 'statement'
          },
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { literal: 'After no-execute block' }
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual(['Say: After no-execute block']);
    });

    it('should handle zero and negative repeat counts', async () => {
      const program: StackProgram = {
        blocks: [
          {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            inputs: {
              TIMES: { literal: 0 }
            },
            slots: {
              DO: [
                {
                  id: 'say1',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: { TEXT: { literal: 'Should not execute' } }
                }
              ]
            }
          },
          {
            id: 'repeat2',
            kind: 'control.repeat',
            form: 'c',
            inputs: {
              TIMES: { literal: -5 }
            },
            slots: {
              DO: [
                {
                  id: 'say2',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: { TEXT: { literal: 'Should not execute either' } }
                }
              ]
            }
          },
          {
            id: 'say3',
            kind: 'looks.say',
            form: 'statement',
            inputs: {
              TEXT: { literal: 'After zero repeats' }
            }
          }
        ]
      };

      await interpreter.run(program);

      expect(executionLog).toEqual(['Say: After zero repeats']);
    });
  });
});