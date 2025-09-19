/**
 * Registry for managing block specifications and providing default blocks
 */

import { StackBlockSpec, StackForm, ExecCtx, ExecResult } from './types';

/**
 * Registry for block specifications with validation and type checking
 */
export class StackRegistry {
  private blocks = new Map<string, StackBlockSpec>();

  /**
   * Register a new block specification
   * @param spec The block specification to register
   * @throws Error if block specification is invalid
   */
  register(spec: StackBlockSpec): void {
    this.validateBlockSpec(spec);
    this.blocks.set(spec.kind, spec);
  }

  /**
   * Get a block specification by kind
   * @param kind The block kind identifier
   * @returns The block specification or undefined if not found
   */
  get(kind: string): StackBlockSpec | undefined {
    return this.blocks.get(kind);
  }

  /**
   * Get all registered block specifications
   * @returns Array of all registered block specifications
   */
  getAll(): StackBlockSpec[] {
    return Array.from(this.blocks.values());
  }

  /**
   * Check if a block kind is registered
   * @param kind The block kind identifier
   * @returns True if the block is registered
   */
  has(kind: string): boolean {
    return this.blocks.has(kind);
  }

  /**
   * Get all blocks of a specific form
   * @param form The block form to filter by
   * @returns Array of block specifications matching the form
   */
  getByForm(form: StackForm): StackBlockSpec[] {
    return this.getAll().filter(spec => spec.form === form);
  }

  /**
   * Validate a block specification
   * @param spec The block specification to validate
   * @throws Error if the specification is invalid
   */
  private validateBlockSpec(spec: StackBlockSpec): void {
    if (!spec.kind || typeof spec.kind !== 'string') {
      throw new Error('Block specification must have a valid kind string');
    }

    if (!spec.label || typeof spec.label !== 'string') {
      throw new Error('Block specification must have a valid label string');
    }

    if (!spec.form || !['hat', 'statement', 'c', 'reporter', 'predicate'].includes(spec.form)) {
      throw new Error('Block specification must have a valid form');
    }

    // Validate inputs if present
    if (spec.inputs) {
      if (!Array.isArray(spec.inputs)) {
        throw new Error('Block inputs must be an array');
      }
      
      for (const input of spec.inputs) {
        if (!input.key || typeof input.key !== 'string') {
          throw new Error('Each input must have a valid key string');
        }
        
        if (input.type && !['number', 'string', 'boolean', 'any'].includes(input.type)) {
          throw new Error('Input type must be one of: number, string, boolean, any');
        }
      }
    }

    // Validate slots if present
    if (spec.slots) {
      if (!Array.isArray(spec.slots)) {
        throw new Error('Block slots must be an array');
      }
      
      for (const slot of spec.slots) {
        if (!slot.key || typeof slot.key !== 'string') {
          throw new Error('Each slot must have a valid key string');
        }
      }
    }

    // C-blocks should have slots
    if (spec.form === 'c' && (!spec.slots || spec.slots.length === 0)) {
      throw new Error('C-blocks must have at least one slot');
    }

    // Hat blocks should not have inputs or slots
    if (spec.form === 'hat' && (spec.inputs?.length || spec.slots?.length)) {
      throw new Error('Hat blocks should not have inputs or slots');
    }
  }
}
/**
 * Default block specifications for basic functionality
 */
export const DefaultBlocks: StackBlockSpec[] = [
  // Event blocks
  {
    kind: 'event.start',
    label: 'when green flag clicked',
    form: 'hat',
    execute: async (_ctx: ExecCtx): Promise<ExecResult> => {
      console.log('Program started');
      return { continue: true };
    }
  },

  // Control blocks
  {
    kind: 'control.repeat',
    label: 'repeat {} times',
    form: 'c',
    inputs: [
      { key: 'TIMES', type: 'number' }
    ],
    slots: [
      { key: 'DO', label: 'do' }
    ],
    execute: async (ctx: ExecCtx): Promise<ExecResult> => {
      const times = await ctx.getInput('TIMES') as number;
      const repeatCount = Math.max(0, Math.floor(times || 0));
      
      for (let i = 0; i < repeatCount; i++) {
        await ctx.executeSlot('DO');
      }
      
      return { continue: true };
    }
  },

  {
    kind: 'control.wait',
    label: 'wait {} seconds',
    form: 'statement',
    inputs: [
      { key: 'DURATION', type: 'number' }
    ],
    execute: async (ctx: ExecCtx): Promise<ExecResult> => {
      const duration = await ctx.getInput('DURATION') as number;
      const waitTime = Math.max(0, duration || 0) * 1000; // Convert to milliseconds
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      console.log(`Waited ${duration} seconds`);
      
      return { continue: true };
    }
  },

  // Looks blocks
  {
    kind: 'looks.say',
    label: 'say {}',
    form: 'statement',
    inputs: [
      { key: 'TEXT', type: 'string' }
    ],
    execute: async (ctx: ExecCtx): Promise<ExecResult> => {
      const text = await ctx.getInput('TEXT') as string;
      console.log(`Say: ${text || ''}`);
      
      return { continue: true };
    }
  },

  {
    kind: 'looks.think',
    label: 'think {}',
    form: 'statement',
    inputs: [
      { key: 'TEXT', type: 'string' }
    ],
    execute: async (ctx: ExecCtx): Promise<ExecResult> => {
      const text = await ctx.getInput('TEXT') as string;
      console.log(`Think: ${text || ''}`);
      
      return { continue: true };
    }
  },

  // Additional C-block for testing nested structures
  {
    kind: 'control.if',
    label: 'if {} then',
    form: 'c',
    inputs: [
      { key: 'CONDITION', type: 'boolean' }
    ],
    slots: [
      { key: 'THEN', label: 'then' }
    ],
    execute: async (ctx: ExecCtx): Promise<ExecResult> => {
      const condition = await ctx.getInput('CONDITION') as boolean;
      
      if (condition) {
        await ctx.executeSlot('THEN');
      }
      
      return { continue: true };
    }
  },

  {
    kind: 'control.if_else',
    label: 'if {} then',
    form: 'c',
    inputs: [
      { key: 'CONDITION', type: 'boolean' }
    ],
    slots: [
      { key: 'THEN', label: 'then' },
      { key: 'ELSE', label: 'else' }
    ],
    execute: async (ctx: ExecCtx): Promise<ExecResult> => {
      const condition = await ctx.getInput('CONDITION') as boolean;
      
      if (condition) {
        await ctx.executeSlot('THEN');
      } else {
        await ctx.executeSlot('ELSE');
      }
      
      return { continue: true };
    }
  }
];

/**
 * Create a new StackRegistry with default blocks pre-registered
 * @returns A new StackRegistry instance with default blocks
 */
export function createDefaultRegistry(): StackRegistry {
  const registry = new StackRegistry();
  
  for (const block of DefaultBlocks) {
    registry.register(block);
  }
  
  return registry;
}