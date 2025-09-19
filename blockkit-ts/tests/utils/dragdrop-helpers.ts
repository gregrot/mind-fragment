/**
 * Enhanced test utilities for advanced drag-and-drop testing
 */

import { StackProgram, StackBlock, StackBlockSpec } from '../../src/types';
import { EnhancedMockDataTransfer } from './setup';

// Types for drag operation context
export interface DragContext {
  isDragging: boolean;
  draggedBlock?: StackBlock;
  draggedBlockId?: string;
  dragType: 'palette-block' | 'existing-block';
  sourceSequence?: SequenceIdentifier;
  validTargets: DropTarget[];
  currentTarget?: DropTarget;
}

export interface SequenceIdentifier {
  type: 'main' | 'c-block-slot';
  parentBlockId?: string;
  slotKey?: string;
}

export interface DropTarget {
  sequenceId: SequenceIdentifier;
  insertionIndex: number;
  element: HTMLElement;
  isValid: boolean;
}

export interface DragStartContext {
  block: StackBlock;
  sourceSequence: SequenceIdentifier;
  dragType: 'existing-block';
}

export interface DropResult {
  success: boolean;
  operation: 'create' | 'move' | 'reorder';
  targetSequence: SequenceIdentifier;
  insertionIndex: number;
  blockId: string;
  error?: string;
}

export interface ProgramStateChange {
  type: 'block-added' | 'block-moved' | 'block-reordered';
  blockId: string;
  sourceSequence?: SequenceIdentifier;
  targetSequence: SequenceIdentifier;
  insertionIndex: number;
  timestamp: number;
}

// Drag data structures
export interface PaletteDragData {
  type: 'palette-block';
  spec: StackBlockSpec;
  timestamp: number;
}

export interface ExistingBlockDragData {
  type: 'existing-block';
  blockId: string;
  block: StackBlock;
  sourceSequence: SequenceIdentifier;
  timestamp: number;
}

export type DragData = PaletteDragData | ExistingBlockDragData;

/**
 * Enhanced mock DataTransfer factory with position simulation
 */
export function createEnhancedMockDataTransfer(): EnhancedMockDataTransfer {
  return new EnhancedMockDataTransfer();
}

/**
 * Create mock drag data for palette blocks
 */
export function createPaletteDragData(spec: StackBlockSpec): PaletteDragData {
  return {
    type: 'palette-block',
    spec,
    timestamp: Date.now()
  };
}

/**
 * Create mock drag data for existing blocks
 */
export function createExistingBlockDragData(
  block: StackBlock, 
  sourceSequence: SequenceIdentifier
): ExistingBlockDragData {
  return {
    type: 'existing-block',
    blockId: block.id,
    block,
    sourceSequence,
    timestamp: Date.now()
  };
}

/**
 * Simulate a complete drag operation with position tracking
 */
export function simulateDragOperation(
  sourceElement: HTMLElement,
  targetElement: HTMLElement,
  dragData: DragData,
  options: {
    mousePosition?: { x: number; y: number };
    insertionIndex?: number;
  } = {}
): EnhancedMockDataTransfer {
  const dataTransfer = createEnhancedMockDataTransfer();
  
  // Set drag data
  dataTransfer.setData('application/json', JSON.stringify(dragData));
  
  // Simulate mouse position if provided
  if (options.mousePosition) {
    dataTransfer.simulateMousePosition(options.mousePosition.x, options.mousePosition.y);
  }
  
  // Simulate drop target
  dataTransfer.simulateDropTarget(targetElement);
  
  return dataTransfer;
}

/**
 * Create complex program structures for testing
 */
export class ProgramBuilder {
  private program: StackProgram = { blocks: [] };
  private blockIdCounter = 0;

  /**
   * Generate unique block ID
   */
  private generateId(): string {
    return `test-block-${++this.blockIdCounter}`;
  }

  /**
   * Add a simple statement block to main sequence
   */
  addStatement(kind: string, inputs?: Record<string, any>): ProgramBuilder {
    const block: StackBlock = {
      id: this.generateId(),
      kind,
      form: 'statement',
      inputs: inputs ? Object.fromEntries(
        Object.entries(inputs).map(([key, value]) => [key, { literal: value }])
      ) : undefined
    };
    this.program.blocks.push(block);
    return this;
  }

  /**
   * Add a hat block to main sequence
   */
  addHat(kind: string): ProgramBuilder {
    const block: StackBlock = {
      id: this.generateId(),
      kind,
      form: 'hat'
    };
    this.program.blocks.push(block);
    return this;
  }

  /**
   * Add a reporter block to main sequence
   */
  addReporter(kind: string): ProgramBuilder {
    const block: StackBlock = {
      id: this.generateId(),
      kind,
      form: 'reporter'
    };
    this.program.blocks.push(block);
    return this;
  }

  /**
   * Add a C-block with nested content
   */
  addCBlock(
    kind: string, 
    inputs?: Record<string, any>,
    slots?: Record<string, StackBlock[]>
  ): ProgramBuilder {
    const block: StackBlock = {
      id: this.generateId(),
      kind,
      form: 'c',
      inputs: inputs ? Object.fromEntries(
        Object.entries(inputs).map(([key, value]) => [key, { literal: value }])
      ) : undefined,
      slots: slots || {}
    };
    this.program.blocks.push(block);
    return this;
  }

  /**
   * Add a nested C-block structure (C-block containing other C-blocks)
   */
  addNestedCBlocks(depth: number = 2): ProgramBuilder {
    let currentSlots: Record<string, StackBlock[]> = {};
    
    // Build nested structure from inside out
    for (let i = depth; i > 0; i--) {
      const innerBlock: StackBlock = {
        id: this.generateId(),
        kind: 'control.repeat',
        form: 'c',
        inputs: { TIMES: { literal: i } },
        slots: i === depth ? { DO: [] } : currentSlots
      };
      
      if (i < depth) {
        // Add a statement block alongside the nested C-block
        const statementBlock: StackBlock = {
          id: this.generateId(),
          kind: 'looks.say',
          form: 'statement',
          inputs: { TEXT: { literal: `Level ${i}` } }
        };
        currentSlots = { DO: [statementBlock, innerBlock] };
      } else {
        currentSlots = { DO: [innerBlock] };
      }
    }

    // Add the outermost C-block to main sequence
    const outerBlock: StackBlock = {
      id: this.generateId(),
      kind: 'control.repeat',
      form: 'c',
      inputs: { TIMES: { literal: depth + 1 } },
      slots: currentSlots
    };
    
    this.program.blocks.push(outerBlock);
    return this;
  }

  /**
   * Add multiple C-blocks with different slot configurations
   */
  addMultipleCBlocks(): ProgramBuilder {
    // Add repeat block with content
    this.addCBlock('control.repeat', { TIMES: 3 }, {
      DO: [
        {
          id: this.generateId(),
          kind: 'looks.say',
          form: 'statement',
          inputs: { TEXT: { literal: 'In repeat' } }
        }
      ]
    });

    // Add if-else block with content in both slots
    this.addCBlock('control.if_else', { CONDITION: true }, {
      THEN: [
        {
          id: this.generateId(),
          kind: 'looks.think',
          form: 'statement',
          inputs: { TEXT: { literal: 'If true' } }
        }
      ],
      ELSE: [
        {
          id: this.generateId(),
          kind: 'looks.say',
          form: 'statement',
          inputs: { TEXT: { literal: 'If false' } }
        }
      ]
    });

    return this;
  }

  /**
   * Create a program with mixed block types for comprehensive testing
   */
  addMixedBlockTypes(): ProgramBuilder {
    this.addHat('event.start');
    this.addStatement('looks.say', { TEXT: 'Hello' });
    this.addReporter('sensing.mouse_x');
    this.addCBlock('control.repeat', { TIMES: 2 }, {
      DO: [
        {
          id: this.generateId(),
          kind: 'motion.move',
          form: 'statement',
          inputs: { STEPS: { literal: 10 } }
        }
      ]
    });
    this.addStatement('looks.think', { TEXT: 'Done' });
    return this;
  }

  /**
   * Build and return the program
   */
  build(): StackProgram {
    return { ...this.program };
  }

  /**
   * Get a specific block by index from main sequence
   */
  getBlock(index: number): StackBlock | undefined {
    return this.program.blocks[index];
  }

  /**
   * Get a block from a C-block slot
   */
  getBlockFromSlot(parentIndex: number, slotKey: string, blockIndex: number): StackBlock | undefined {
    const parentBlock = this.program.blocks[parentIndex];
    if (!parentBlock?.slots?.[slotKey]) return undefined;
    return parentBlock.slots[slotKey][blockIndex];
  }

  /**
   * Reset the builder for reuse
   */
  reset(): ProgramBuilder {
    this.program = { blocks: [] };
    this.blockIdCounter = 0;
    return this;
  }
}

/**
 * Assertion helpers for validating program state changes
 */
export class ProgramAssertions {
  /**
   * Assert that a program has the expected number of blocks in main sequence
   */
  static assertMainSequenceLength(program: StackProgram, expectedLength: number): void {
    if (program.blocks.length !== expectedLength) {
      throw new Error(
        `Expected main sequence to have ${expectedLength} blocks, but got ${program.blocks.length}`
      );
    }
  }

  /**
   * Assert that a specific block exists in main sequence
   */
  static assertBlockInMainSequence(
    program: StackProgram, 
    blockId: string, 
    expectedIndex?: number
  ): void {
    const blockIndex = program.blocks.findIndex(block => block.id === blockId);
    
    if (blockIndex === -1) {
      throw new Error(`Block with ID ${blockId} not found in main sequence`);
    }
    
    if (expectedIndex !== undefined && blockIndex !== expectedIndex) {
      throw new Error(
        `Block ${blockId} found at index ${blockIndex}, expected at index ${expectedIndex}`
      );
    }
  }

  /**
   * Assert that a block exists in a specific C-block slot
   */
  static assertBlockInSlot(
    program: StackProgram,
    parentBlockId: string,
    slotKey: string,
    blockId: string,
    expectedIndex?: number
  ): void {
    const parentBlock = program.blocks.find(block => block.id === parentBlockId);
    
    if (!parentBlock) {
      throw new Error(`Parent block with ID ${parentBlockId} not found`);
    }
    
    if (!parentBlock.slots?.[slotKey]) {
      throw new Error(`Slot ${slotKey} not found in block ${parentBlockId}`);
    }
    
    const slotBlocks = parentBlock.slots[slotKey];
    const blockIndex = slotBlocks.findIndex(block => block.id === blockId);
    
    if (blockIndex === -1) {
      throw new Error(`Block ${blockId} not found in slot ${slotKey} of block ${parentBlockId}`);
    }
    
    if (expectedIndex !== undefined && blockIndex !== expectedIndex) {
      throw new Error(
        `Block ${blockId} found at index ${blockIndex} in slot ${slotKey}, expected at index ${expectedIndex}`
      );
    }
  }

  /**
   * Assert that a block has been moved from one location to another
   */
  static assertBlockMoved(
    beforeProgram: StackProgram,
    afterProgram: StackProgram,
    blockId: string,
    expectedTargetLocation: {
      type: 'main' | 'slot';
      parentBlockId?: string;
      slotKey?: string;
      index?: number;
    }
  ): void {
    // Verify block is no longer in original location
    const originalInMain = beforeProgram.blocks.some(block => block.id === blockId);
    const newInMain = afterProgram.blocks.some(block => block.id === blockId);
    
    if (expectedTargetLocation.type === 'main') {
      if (!newInMain) {
        throw new Error(`Block ${blockId} not found in main sequence after move`);
      }
      
      if (expectedTargetLocation.index !== undefined) {
        this.assertBlockInMainSequence(afterProgram, blockId, expectedTargetLocation.index);
      }
    } else if (expectedTargetLocation.type === 'slot') {
      if (!expectedTargetLocation.parentBlockId || !expectedTargetLocation.slotKey) {
        throw new Error('Parent block ID and slot key required for slot location assertion');
      }
      
      this.assertBlockInSlot(
        afterProgram,
        expectedTargetLocation.parentBlockId,
        expectedTargetLocation.slotKey,
        blockId,
        expectedTargetLocation.index
      );
    }
  }

  /**
   * Assert that program structure is valid (no orphaned blocks, valid references)
   */
  static assertProgramStructureValid(program: StackProgram): void {
    const allBlockIds = new Set<string>();
    
    // Collect all block IDs recursively
    function collectBlockIds(blocks: StackBlock[]): void {
      for (const block of blocks) {
        if (allBlockIds.has(block.id)) {
          throw new Error(`Duplicate block ID found: ${block.id}`);
        }
        allBlockIds.add(block.id);
        
        if (block.slots) {
          for (const slotBlocks of Object.values(block.slots)) {
            collectBlockIds(slotBlocks);
          }
        }
      }
    }
    
    collectBlockIds(program.blocks);
    
    // Verify all block references are valid
    function validateBlockReferences(blocks: StackBlock[]): void {
      for (const block of blocks) {
        if (block.inputs) {
          for (const input of Object.values(block.inputs)) {
            if ('blockId' in input && !allBlockIds.has(input.blockId)) {
              throw new Error(`Invalid block reference: ${input.blockId} in block ${block.id}`);
            }
          }
        }
        
        if (block.slots) {
          for (const slotBlocks of Object.values(block.slots)) {
            validateBlockReferences(slotBlocks);
          }
        }
      }
    }
    
    validateBlockReferences(program.blocks);
  }

  /**
   * Assert that two programs are equivalent (same structure and content)
   */
  static assertProgramsEqual(program1: StackProgram, program2: StackProgram): void {
    const serialize = (program: StackProgram): string => JSON.stringify(program, null, 2);
    
    const serialized1 = serialize(program1);
    const serialized2 = serialize(program2);
    
    if (serialized1 !== serialized2) {
      throw new Error(`Programs are not equal:\nProgram 1: ${serialized1}\nProgram 2: ${serialized2}`);
    }
  }

  /**
   * Assert that a slot has the expected number of blocks
   */
  static assertSlotLength(
    program: StackProgram,
    parentBlockId: string,
    slotKey: string,
    expectedLength: number
  ): void {
    const parentBlock = program.blocks.find(block => block.id === parentBlockId);
    
    if (!parentBlock) {
      throw new Error(`Parent block with ID ${parentBlockId} not found`);
    }
    
    if (!parentBlock.slots?.[slotKey]) {
      throw new Error(`Slot ${slotKey} not found in block ${parentBlockId}`);
    }
    
    const actualLength = parentBlock.slots[slotKey].length;
    
    if (actualLength !== expectedLength) {
      throw new Error(
        `Slot ${slotKey} in block ${parentBlockId} has ${actualLength} blocks, expected ${expectedLength}`
      );
    }
  }
}

/**
 * Multi-step drag operation simulator
 */
export class MultiStepDragSimulator {
  private operations: Array<{
    sourceElement: HTMLElement;
    targetElement: HTMLElement;
    dragData: DragData;
    options?: any;
  }> = [];

  /**
   * Add a drag operation to the sequence
   */
  addOperation(
    sourceElement: HTMLElement,
    targetElement: HTMLElement,
    dragData: DragData,
    options?: any
  ): MultiStepDragSimulator {
    this.operations.push({ sourceElement, targetElement, dragData, options });
    return this;
  }

  /**
   * Execute all operations in sequence
   */
  execute(): EnhancedMockDataTransfer[] {
    const results: EnhancedMockDataTransfer[] = [];
    
    for (const operation of this.operations) {
      const dataTransfer = simulateDragOperation(
        operation.sourceElement,
        operation.targetElement,
        operation.dragData,
        operation.options
      );
      results.push(dataTransfer);
      
      // Small delay between operations to simulate real user behavior
      // In tests, this is synchronous but helps with debugging
    }
    
    return results;
  }

  /**
   * Reset the simulator for reuse
   */
  reset(): MultiStepDragSimulator {
    this.operations = [];
    return this;
  }
}