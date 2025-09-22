import type { BlockInstance, WorkspaceState } from '../../types/blocks';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
}

export type BlockInstruction =
  | { kind: 'move'; duration: number; speed: number }
  | { kind: 'turn'; duration: number; angularVelocity: number }
  | { kind: 'wait'; duration: number }
  | { kind: 'scan'; duration: number; filter: string | null }
  | { kind: 'gather'; duration: number; target: 'auto' }
  | { kind: 'status-toggle'; duration: number }
  | { kind: 'status-set'; duration: number; value: boolean }
  | { kind: 'loop'; instructions: BlockInstruction[] };

export interface CompiledProgram {
  instructions: BlockInstruction[];
}

export interface CompilationResult {
  program: CompiledProgram;
  diagnostics: Diagnostic[];
}

const MOVE_SPEED = 80;
const TURN_RATE = Math.PI / 2;
const WAIT_DURATION = 1;
const SCAN_DURATION = 1;
const GATHER_DURATION = 1.5;
const DEFAULT_REPEAT_COUNT = 3;

interface CompilationContext {
  repeatInfoIssued: boolean;
  conditionalInfoIssued: boolean;
  conditionalElseWarned: boolean;
  unsupportedBlocks: Set<string>;
}

const createContext = (): CompilationContext => ({
  repeatInfoIssued: false,
  conditionalInfoIssued: false,
  conditionalElseWarned: false,
  unsupportedBlocks: new Set<string>(),
});

const compileSequence = (
  blocks: BlockInstance[] | undefined,
  diagnostics: Diagnostic[],
  context: CompilationContext,
): BlockInstruction[] => {
  if (!blocks || blocks.length === 0) {
    return [];
  }

  const instructions: BlockInstruction[] = [];
  for (const block of blocks) {
    instructions.push(...compileBlock(block, diagnostics, context));
  }
  return instructions;
};

const compileBlock = (
  block: BlockInstance,
  diagnostics: Diagnostic[],
  context: CompilationContext,
): BlockInstruction[] => {
  switch (block.type) {
    case 'move':
      return [{ kind: 'move', duration: 1, speed: MOVE_SPEED }];
    case 'turn':
      return [{ kind: 'turn', duration: 1, angularVelocity: TURN_RATE }];
    case 'wait':
      return [{ kind: 'wait', duration: WAIT_DURATION }];
    case 'scan-resources':
      return [{ kind: 'scan', duration: SCAN_DURATION, filter: null }];
    case 'toggle-status':
      return [{ kind: 'status-toggle', duration: 0 }];
    case 'set-status': {
      const state = (block.state ?? {}) as { value?: unknown };
      const value = typeof state.value === 'boolean' ? state.value : true;
      return [{ kind: 'status-set', duration: 0, value }];
    }
    case 'gather-resource':
      return [{ kind: 'gather', duration: GATHER_DURATION, target: 'auto' }];
    case 'return-home':
      return [{ kind: 'move', duration: 1, speed: MOVE_SPEED }];
    case 'deposit-cargo':
      return [{ kind: 'wait', duration: WAIT_DURATION }];
    case 'repeat': {
      const inner = compileSequence(block.slots?.do, diagnostics, context);
      if (inner.length === 0) {
        return [];
      }
      if (!context.repeatInfoIssued) {
        diagnostics.push({
          severity: 'info',
          message:
            'Repeat blocks currently loop three times while parameter editing is under construction.',
        });
        context.repeatInfoIssued = true;
      }
      const repetitions: BlockInstruction[] = [];
      for (let index = 0; index < DEFAULT_REPEAT_COUNT; index += 1) {
        repetitions.push(...inner.map((instruction) => ({ ...instruction })));
      }
      return repetitions;
    }
    case 'parallel': {
      const branchA = compileSequence(block.slots?.branchA, diagnostics, context);
      const branchB = compileSequence(block.slots?.branchB, diagnostics, context);
      if (branchA.length === 0 && branchB.length === 0) {
        return [];
      }
      if (!context.unsupportedBlocks.has(block.type)) {
        diagnostics.push({
          severity: 'warning',
          message:
            'Parallel blocks execute their branches sequentially in this MVP preview.',
        });
        context.unsupportedBlocks.add(block.type);
      }
      return [...branchA, ...branchB];
    }
    case 'forever': {
      const inner = compileSequence(block.slots?.do, diagnostics, context);
      if (inner.length === 0) {
        diagnostics.push({
          severity: 'warning',
          message: 'Forever blocks need actions inside them to have an effect.',
        });
        return [];
      }
      return [{ kind: 'loop', instructions: inner }];
    }
    case 'if': {
      const thenInstructions = compileSequence(block.slots?.then, diagnostics, context);
      const elseInstructions = compileSequence(block.slots?.else, diagnostics, context);

      if (!context.conditionalInfoIssued) {
        diagnostics.push({
          severity: 'info',
          message:
            'Conditionals are wired to always follow their THEN branch while sensor inputs are stubbed in this slice.',
        });
        context.conditionalInfoIssued = true;
      }

      if (elseInstructions.length > 0 && !context.conditionalElseWarned) {
        diagnostics.push({
          severity: 'warning',
          message: 'Else branches are ignored for now; add recovery steps under THEN to handle hazards.',
        });
        context.conditionalElseWarned = true;
      }

      return thenInstructions;
    }
    default: {
      if (!context.unsupportedBlocks.has(block.type)) {
        diagnostics.push({
          severity: 'warning',
          message: `The ${block.type} block is not runnable yet and will be ignored.`,
        });
        context.unsupportedBlocks.add(block.type);
      }
      return [];
    }
  }
};

export const compileWorkspaceProgram = (workspace: WorkspaceState): CompilationResult => {
  const diagnostics: Diagnostic[] = [];
  const context = createContext();

  const startBlocks = workspace.filter((block) => block.type === 'start');
  if (startBlocks.length === 0) {
    diagnostics.push({
      severity: 'warning',
      message: 'Add a "When Started" block to trigger the routine.',
    });
    return { program: { instructions: [] }, diagnostics };
  }

  const entry = startBlocks[0];
  const instructions = compileSequence(entry.slots?.do, diagnostics, context);

  if (instructions.length === 0) {
    diagnostics.push({
      severity: 'warning',
      message: 'Place movement or wait blocks under "When Started" to see the robot react.',
    });
  }

  return {
    program: { instructions },
    diagnostics,
  };
};
