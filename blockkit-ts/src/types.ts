/**
 * Core type definitions for the simplified stack blocks library
 */

/**
 * The visual form/shape of a block
 */
export type StackForm = "hat" | "statement" | "c" | "reporter" | "predicate";

/**
 * Input value can be either a literal value or reference to another block
 */
export type InputValue = { literal: unknown } | { blockId: string };

/**
 * Execution context passed to block execute functions
 */
export interface ExecCtx<C = any> {
  /** Get the value of an input (resolves block references) */
  getInput(key: string): Promise<unknown>;
  /** Execute blocks in a slot */
  executeSlot(key: string): Promise<void>;
  /** Block's configuration data */
  config?: C;
  /** Current block being executed */
  block: StackBlock<C>;
}

/**
 * Result of block execution
 */
export interface ExecResult {
  /** Return value for reporter/predicate blocks */
  value?: unknown;
  /** Whether to continue execution (for control blocks) */
  continue?: boolean;
}

/**
 * Specification for a block type
 */
export interface StackBlockSpec<C = any> {
  /** Unique identifier for this block type */
  kind: string;
  /** Display label for the block */
  label: string;
  /** Visual form of the block */
  form: StackForm;
  /** Input definitions */
  inputs?: { key: string; type?: "number" | "string" | "boolean" | "any" }[];
  /** Slot definitions for C-blocks */
  slots?: { key: string; label?: string }[];
  /** Execution function */
  execute?: (ctx: ExecCtx<C>) => Promise<ExecResult> | ExecResult;
}

/**
 * A block instance in a program
 */
export interface StackBlock<C = any> {
  /** Unique identifier for this block instance */
  id: string;
  /** Block type identifier */
  kind: string;
  /** Visual form of the block */
  form: StackForm;
  /** Input values */
  inputs?: Record<string, InputValue>;
  /** Child blocks in slots (for C-blocks) */
  slots?: Record<string, StackBlock[]>;
  /** Block-specific configuration */
  config?: C;
}

/**
 * A complete program consisting of a list of top-level blocks
 */
export interface StackProgram {
  /** Top-level blocks in the program */
  blocks: StackBlock[];
}