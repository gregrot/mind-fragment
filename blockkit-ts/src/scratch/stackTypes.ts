import { z } from "zod";

export type StackForm = "hat" | "statement" | "c" | "reporter" | "predicate";

// Literal or nested reporter/predicate block
export type InputValue = { literal: unknown } | { blockId: string };

export interface SlotSpec {
  key: string;                 // e.g. "DO" in repeat
  accepts?: "statement";      // future: menus for reporter-only slots
  label?: string;
}

export interface StackBlockSpec<C = any> {
  kind: string;                 // unique
  label: string;
  form: StackForm;              // hat, statement, c, reporter, predicate
  inputs?: { key: string; type?: "number"|"string"|"boolean"|"any" }[]; // reporter/predicate inputs
  slots?: SlotSpec[];           // for C-shaped blocks
  configSchema?: z.ZodType<C>;

  // Execution hook for runtime. For reporter/predicate, return a value.
  execute?: (ctx: ExecCtx<C>) => Promise<ExecResult> | ExecResult;
}

export interface ExecCtx<C> {
  getInput(key: string): Promise<unknown>;        // resolves literal or nested reporter
  runSlot(slotKey: string): Promise<void>;        // sequentially execute statements inside slot
  state: Record<string, unknown>;                 // scratchpad for host
  config: C;                                      // validated node config
}

export type ExecResult = void | boolean | number | string | unknown;

export type NodeId = string;

export interface StackNode<C = any> {
  id: NodeId;
  kind: string;                 // StackBlockSpec.kind
  form: StackForm;
  // Sequence pointers (like Scratch):
  next?: NodeId | null;         // next statement in the same stack
  parent?: NodeId | null;       // parent statement or C-block
  inSlot?: string | null;       // which slot of parent this node belongs to

  // Inputs for reporter/predicate forms
  inputs?: Record<string, InputValue>;
  // For C-Blocks, children per slot head pointer
  slotHeads?: Record<string, NodeId | null>;

  config?: C;
}

export interface StackProgram {
  heads: NodeId[];    // top-level hats or stacks
  nodes: Record<NodeId, StackNode>;
}

export const StackProgramSchema = z.object({
  heads: z.array(z.string()),
  nodes: z.record(z.any())
});