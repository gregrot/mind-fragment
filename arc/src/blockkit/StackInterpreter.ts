/**
 * Execution engine for running StackProgram instances
 */

import { StackProgram, StackBlock, ExecCtx, ExecResult } from './types';
import { StackRegistry } from './StackRegistry';

/**
 * Interpreter for executing stack-based visual programs
 */
export class StackInterpreter {
  private registry: StackRegistry;
  private executionContext: Map<string, StackBlock> = new Map();

  constructor(registry: StackRegistry) {
    this.registry = registry;
  }

  /**
   * Execute a complete program
   * @param program The program to execute
   */
  async run(program: StackProgram): Promise<void> {
    // Build execution context with all blocks for reference resolution
    this.buildExecutionContext(program);

    try {
      // Execute all top-level blocks sequentially
      await this.executeBlocks(program.blocks);
    } catch (error) {
      console.error('Program execution error:', error);
      throw error;
    } finally {
      // Clean up execution context
      this.executionContext.clear();
    }
  }

  /**
   * Execute a sequence of blocks
   * @param blocks Array of blocks to execute sequentially
   */
  private async executeBlocks(blocks: StackBlock[]): Promise<void> {
    for (const block of blocks) {
      try {
        const result = await this.executeBlock(block);
        
        // Check if execution should continue (for control flow)
        if (result && result.continue === false) {
          break;
        }
      } catch (error) {
        console.error(`Error executing block ${block.id} (${block.kind}):`, error);
        // Continue with next block unless it's a critical error
        if (error instanceof Error && error.message.includes('CRITICAL')) {
          throw error;
        }
      }
    }
  }

  /**
   * Execute a single block
   * @param block The block to execute
   * @returns The execution result
   */
  private async executeBlock(block: StackBlock): Promise<ExecResult | undefined> {
    const spec = this.registry.get(block.kind);
    
    if (!spec) {
      console.warn(`Unknown block type: ${block.kind}`);
      return { continue: true };
    }

    if (!spec.execute) {
      console.warn(`Block ${block.kind} has no execute function`);
      return { continue: true };
    }

    // Create execution context for this block
    const ctx: ExecCtx = {
      getInput: async (key: string) => this.resolveInput(block, key),
      executeSlot: async (key: string) => this.executeSlot(block, key),
      config: block.config,
      block: block
    };

    try {
      const result = await spec.execute(ctx);
      return result || { continue: true };
    } catch (error) {
      console.error(`Block execution failed for ${block.kind}:`, error);
      return { continue: true };
    }
  }

  /**
   * Resolve an input value (literal or block reference)
   * @param block The block requesting the input
   * @param inputKey The input key to resolve
   * @returns The resolved input value
   */
  private async resolveInput(block: StackBlock, inputKey: string): Promise<unknown> {
    const inputValue = block.inputs?.[inputKey];
    
    if (!inputValue) {
      return undefined;
    }

    // Handle literal values
    if ('literal' in inputValue) {
      return inputValue.literal;
    }

    // Handle block references (reporter blocks)
    if ('blockId' in inputValue) {
      const referencedBlock = this.executionContext.get(inputValue.blockId);
      
      if (!referencedBlock) {
        console.warn(`Referenced block not found: ${inputValue.blockId}`);
        return undefined;
      }

      // Execute the referenced block and return its value
      const result = await this.executeBlock(referencedBlock);
      return result?.value;
    }

    return undefined;
  }

  /**
   * Execute blocks in a specific slot of a C-block
   * @param block The C-block containing the slot
   * @param slotKey The slot key to execute
   */
  private async executeSlot(block: StackBlock, slotKey: string): Promise<void> {
    const slotBlocks = block.slots?.[slotKey];
    
    if (!slotBlocks || slotBlocks.length === 0) {
      return;
    }

    // Execute all blocks in the slot sequentially
    await this.executeBlocks(slotBlocks);
  }

  /**
   * Build execution context by indexing all blocks in the program
   * @param program The program to index
   */
  private buildExecutionContext(program: StackProgram): void {
    this.executionContext.clear();
    
    // Recursively index all blocks
    const indexBlocks = (blocks: StackBlock[]) => {
      for (const block of blocks) {
        this.executionContext.set(block.id, block);
        
        // Index blocks in slots
        if (block.slots) {
          for (const slotBlocks of Object.values(block.slots)) {
            indexBlocks(slotBlocks);
          }
        }
      }
    };

    indexBlocks(program.blocks);
  }
}