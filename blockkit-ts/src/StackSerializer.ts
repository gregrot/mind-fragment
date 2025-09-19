/**
 * Serialization utilities for StackProgram
 * Handles JSON serialization and deserialization of visual programs
 */

import { StackProgram, StackBlock } from './types';

/**
 * Serialized program format for JSON storage
 */
export interface SerializedProgram {
  /** Format version for future compatibility */
  version: string;
  /** Serialized program data */
  program: StackProgram;
  /** Timestamp when serialized */
  timestamp: string;
}

/**
 * Current serialization format version
 */
const CURRENT_VERSION = '1.0.0';

/**
 * Serialize a StackProgram to JSON string
 * @param program The program to serialize
 * @returns JSON string representation
 */
export function serializeProgram(program: StackProgram): string {
  const serialized: SerializedProgram = {
    version: CURRENT_VERSION,
    program: cloneProgram(program),
    timestamp: new Date().toISOString()
  };

  return JSON.stringify(serialized, null, 2);
}

/**
 * Deserialize a JSON string to StackProgram
 * @param json JSON string to deserialize
 * @returns Reconstructed StackProgram
 * @throws Error if JSON is invalid or incompatible
 */
export function deserializeProgram(json: string): StackProgram {
  try {
    const parsed = JSON.parse(json);

    // Handle both new format (with version) and legacy format (direct program)
    if (parsed.version && parsed.program) {
      // New format with metadata
      validateSerializedProgram(parsed);
      return cloneProgram(parsed.program);
    } else if (parsed.blocks && Array.isArray(parsed.blocks)) {
      // Legacy format - direct program object
      validateProgram(parsed);
      return cloneProgram(parsed);
    } else {
      throw new Error('Invalid program format: missing blocks array');
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Invalid JSON format');
    }
    throw error;
  }
}

/**
 * Create a deep clone of a program to ensure immutability
 * @param program Program to clone
 * @returns Deep cloned program
 */
function cloneProgram(program: StackProgram): StackProgram {
  return {
    blocks: program.blocks.map(cloneBlock)
  };
}

/**
 * Create a deep clone of a block
 * @param block Block to clone
 * @returns Deep cloned block
 */
function cloneBlock(block: StackBlock): StackBlock {
  const cloned: StackBlock = {
    id: block.id,
    kind: block.kind,
    form: block.form
  };

  // Clone inputs if present
  if (block.inputs) {
    cloned.inputs = {};
    for (const [key, value] of Object.entries(block.inputs)) {
      cloned.inputs[key] = { ...value };
    }
  }

  // Clone slots if present
  if (block.slots) {
    cloned.slots = {};
    for (const [key, blocks] of Object.entries(block.slots)) {
      cloned.slots[key] = blocks.map(cloneBlock);
    }
  }

  // Clone config if present
  if (block.config !== undefined) {
    cloned.config = typeof block.config === 'object' && block.config !== null
      ? JSON.parse(JSON.stringify(block.config))
      : block.config;
  }

  return cloned;
}

/**
 * Validate a serialized program structure
 * @param serialized Serialized program to validate
 * @throws Error if validation fails
 */
function validateSerializedProgram(serialized: any): void {
  if (!serialized.version || typeof serialized.version !== 'string') {
    throw new Error('Invalid serialized program: missing or invalid version');
  }

  if (!serialized.program) {
    throw new Error('Invalid serialized program: missing program data');
  }

  validateProgram(serialized.program);
}

/**
 * Validate a program structure
 * @param program Program to validate
 * @throws Error if validation fails
 */
function validateProgram(program: any): void {
  if (!program || typeof program !== 'object') {
    throw new Error('Invalid program: must be an object');
  }

  if (!Array.isArray(program.blocks)) {
    throw new Error('Invalid program: blocks must be an array');
  }

  // Validate each block
  for (let i = 0; i < program.blocks.length; i++) {
    try {
      validateBlock(program.blocks[i]);
    } catch (error) {
      throw new Error(`Invalid block at index ${i}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Validate a block structure
 * @param block Block to validate
 * @throws Error if validation fails
 */
function validateBlock(block: any): void {
  if (!block || typeof block !== 'object') {
    throw new Error('Block must be an object');
  }

  // Required fields
  if (!block.id || typeof block.id !== 'string') {
    throw new Error('Block must have a string id');
  }

  if (!block.kind || typeof block.kind !== 'string') {
    throw new Error('Block must have a string kind');
  }

  if (!block.form || typeof block.form !== 'string') {
    throw new Error('Block must have a string form');
  }

  // Validate form is one of the allowed values
  const validForms = ['hat', 'statement', 'c', 'reporter', 'predicate'];
  if (!validForms.includes(block.form)) {
    throw new Error(`Block form must be one of: ${validForms.join(', ')}`);
  }

  // Validate inputs if present
  if (block.inputs !== undefined) {
    if (typeof block.inputs !== 'object' || block.inputs === null) {
      throw new Error('Block inputs must be an object');
    }

    for (const [key, value] of Object.entries(block.inputs)) {
      if (!value || typeof value !== 'object') {
        throw new Error(`Input ${key} must be an object`);
      }

      // Must have either literal or blockId
      const hasLiteral = 'literal' in value;
      const hasBlockId = 'blockId' in value && typeof (value as any).blockId === 'string';

      if (!hasLiteral && !hasBlockId) {
        throw new Error(`Input ${key} must have either literal or blockId property`);
      }

      if (hasLiteral && hasBlockId) {
        throw new Error(`Input ${key} cannot have both literal and blockId properties`);
      }
    }
  }

  // Validate slots if present
  if (block.slots !== undefined) {
    if (typeof block.slots !== 'object' || block.slots === null) {
      throw new Error('Block slots must be an object');
    }

    for (const [key, blocks] of Object.entries(block.slots)) {
      if (!Array.isArray(blocks)) {
        throw new Error(`Slot ${key} must be an array of blocks`);
      }

      // Recursively validate nested blocks
      for (let i = 0; i < blocks.length; i++) {
        try {
          validateBlock(blocks[i]);
        } catch (error) {
          throw new Error(`Invalid block in slot ${key} at index ${i}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
}

/**
 * Check if a JSON string represents a valid program
 * @param json JSON string to check
 * @returns true if valid, false otherwise
 */
export function isValidProgramJson(json: string): boolean {
  try {
    deserializeProgram(json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get program statistics for debugging/info purposes
 * @param program Program to analyze
 * @returns Statistics object
 */
export function getProgramStats(program: StackProgram): {
  totalBlocks: number;
  blocksByForm: Record<string, number>;
  maxNestingDepth: number;
} {
  const stats = {
    totalBlocks: 0,
    blocksByForm: {} as Record<string, number>,
    maxNestingDepth: 0
  };

  function analyzeBlock(block: StackBlock, depth: number): void {
    stats.totalBlocks++;
    stats.blocksByForm[block.form] = (stats.blocksByForm[block.form] || 0) + 1;
    stats.maxNestingDepth = Math.max(stats.maxNestingDepth, depth);

    // Analyze nested blocks in slots
    if (block.slots) {
      for (const slotBlocks of Object.values(block.slots)) {
        for (const nestedBlock of slotBlocks) {
          analyzeBlock(nestedBlock, depth + 1);
        }
      }
    }
  }

  for (const block of program.blocks) {
    analyzeBlock(block, 1);
  }

  return stats;
}