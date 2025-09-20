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
  | { kind: 'gather'; duration: number; target: 'auto' };

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
  unsupportedBlocks: Set<string>;
}

const createContext = (): CompilationContext => ({
  repeatInfoIssued: false,
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
    case 'gather-resource':
      return [{ kind: 'gather', duration: GATHER_DURATION, target: 'auto' }];
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
    case 'forever':
    case 'if':
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
