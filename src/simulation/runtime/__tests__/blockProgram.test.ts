import { describe, expect, it } from 'vitest';
import { compileWorkspaceProgram } from '../blockProgram';
import { createBlockInstance } from '../../../blocks/library';

const buildWorkspace = (...blocks: ReturnType<typeof createBlockInstance>[]) => blocks;

const extractLiteral = (value: number | null | undefined): number => {
  if (typeof value === 'number') {
    return value;
  }
  throw new Error('Expected a literal number to be present.');
};

describe('compileWorkspaceProgram', () => {
  it('reports an error when no start block is present', () => {
    const result = compileWorkspaceProgram(buildWorkspace(createBlockInstance('move')));

    expect(result.program.instructions).toHaveLength(0);
    const error = result.diagnostics.find((diag) => diag.message.includes('When Started'));
    expect(error?.severity).toBe('error');
  });

  it('compiles a simple move routine with literal metadata', () => {
    const start = createBlockInstance('start');
    const move = createBlockInstance('move');
    const wait = createBlockInstance('wait');
    start.slots!.do = [move, wait];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(2);
    const [moveInstruction, waitInstruction] = result.program.instructions;
    if (moveInstruction.kind !== 'move') {
      throw new Error('Expected the first instruction to be a move.');
    }
    expect(moveInstruction.sourceBlockId).toBe(move.instanceId);
    expect(extractLiteral(moveInstruction.duration.literal?.value)).toBeCloseTo(1);
    expect(extractLiteral(moveInstruction.speed.literal?.value)).toBeGreaterThan(0);
    if (waitInstruction.kind !== 'wait') {
      throw new Error('Expected the second instruction to be a wait.');
    }
    expect(waitInstruction.sourceBlockId).toBe(wait.instanceId);
    expect(extractLiteral(waitInstruction.duration.literal?.value)).toBeCloseTo(1);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('compiles move-to instructions with scan metadata and literal fallbacks', () => {
    const start = createBlockInstance('start');
    const moveTo = createBlockInstance('move-to');

    moveTo.parameters!.useScanHit = { kind: 'boolean', value: false };
    moveTo.parameters!.scanHitIndex = { kind: 'number', value: 2 };
    moveTo.parameters!.targetX = { kind: 'number', value: 120 };
    moveTo.parameters!.targetY = { kind: 'number', value: -40 };
    moveTo.parameters!.speed = { kind: 'number', value: 60 };

    start.slots!.do = [moveTo];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(1);
    const instruction = result.program.instructions[0];
    if (instruction.kind !== 'move-to') {
      throw new Error('Expected a move-to instruction.');
    }
    expect(instruction.sourceBlockId).toBe(moveTo.instanceId);
    expect(instruction.target.useScanHit.literal?.value).toBe(false);
    expect(instruction.target.useScanHit.literal?.source).toBe('user');
    expect(instruction.target.scanHitIndex.literal?.value).toBe(2);
    expect(instruction.target.literalPosition.x.literal?.value).toBe(120);
    expect(instruction.target.literalPosition.y.literal?.value).toBe(-40);
    expect(instruction.speed.literal?.value).toBe(60);
  });

  it('emits scan and gather instructions with literal durations', () => {
    const start = createBlockInstance('start');
    const scan = createBlockInstance('scan-resources');
    const gather = createBlockInstance('gather-resource');
    start.slots!.do = [scan, gather];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(2);
    const [scanInstruction, gatherInstruction] = result.program.instructions;
    expect(scanInstruction).toMatchObject({ kind: 'scan', filter: null });
    if (scanInstruction.kind === 'scan') {
      expect(scanInstruction.sourceBlockId).toBe(scan.instanceId);
      expect(extractLiteral(scanInstruction.duration.literal?.value)).toBeGreaterThan(0);
    }
    expect(gatherInstruction).toMatchObject({ kind: 'gather', target: 'auto' });
    if (gatherInstruction.kind === 'gather') {
      expect(gatherInstruction.sourceBlockId).toBe(gather.instanceId);
      expect(extractLiteral(gatherInstruction.duration.literal?.value)).toBeGreaterThan(0);
    }
  });

  it('compiles status control blocks with literal overrides', () => {
    const start = createBlockInstance('start');
    const toggle = createBlockInstance('toggle-status');
    const setStatus = createBlockInstance('set-status');
    setStatus.parameters!.value = { kind: 'boolean', value: false };
    start.slots!.do = [toggle, setStatus];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(2);
    const [, statusInstruction] = result.program.instructions;
    if (statusInstruction.kind !== 'status-set') {
      throw new Error('Expected a status-set instruction.');
    }
    expect(statusInstruction.sourceBlockId).toBe(setStatus.instanceId);
    expect(statusInstruction.duration.literal?.value).toBe(0);
    expect(statusInstruction.value.literal?.value).toBe(false);
    expect(statusInstruction.value.literal?.source).toBe('user');
  });

  it('wraps forever blocks in loop instructions so the runner can repeat them', () => {
    const start = createBlockInstance('start');
    const forever = createBlockInstance('forever');
    const gather = createBlockInstance('gather-resource');
    forever.slots!.do = [gather];
    start.slots!.do = [forever];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(1);
    const loop = result.program.instructions[0];
    if (loop.kind !== 'loop') {
      throw new Error('Expected a loop instruction to be emitted.');
    }
    expect(loop.sourceBlockId).toBe(forever.instanceId);
    expect(loop.mode).toBe('forever');
    expect(loop.instructions).toHaveLength(1);
    expect(loop.instructions[0]).toMatchObject({ kind: 'gather', target: 'auto' });
    expect(loop.instructions[0]?.sourceBlockId).toBe(gather.instanceId);
  });

  it('compiles repeat blocks into counted loops with defaults', () => {
    const start = createBlockInstance('start');
    const repeat = createBlockInstance('repeat');
    const move = createBlockInstance('move');
    repeat.slots!.do = [move];
    start.slots!.do = [repeat];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(1);
    const instruction = result.program.instructions[0];
    if (instruction.kind !== 'loop') {
      throw new Error('Expected a loop instruction.');
    }
    if (instruction.mode !== 'counted') {
      throw new Error('Expected a counted loop.');
    }
    expect(instruction.sourceBlockId).toBe(repeat.instanceId);
    expect(extractLiteral(instruction.iterations.literal?.value)).toBe(3);
    expect(instruction.iterations.literal?.source).toBe('default');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('honours user-specified repeat counts when provided', () => {
    const start = createBlockInstance('start');
    const repeat = createBlockInstance('repeat');
    const move = createBlockInstance('move');
    repeat.slots!.do = [move];
    repeat.parameters!.count = { kind: 'number', value: 5 };
    start.slots!.do = [repeat];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(1);
    const instruction = result.program.instructions[0];
    if (instruction.kind !== 'loop' || instruction.mode !== 'counted') {
      throw new Error('Expected a counted loop instruction.');
    }
    expect(instruction.sourceBlockId).toBe(repeat.instanceId);
    expect(instruction.iterations.literal?.value).toBe(5);
    expect(instruction.iterations.literal?.source).toBe('user');
  });

  it('branches into THEN and ELSE sequences when compiling conditionals', () => {
    const start = createBlockInstance('start');
    const conditional = createBlockInstance('if');
    const thenTurn = createBlockInstance('turn');
    const elseMove = createBlockInstance('move');

    conditional.slots!.then = [thenTurn];
    conditional.slots!.else = [elseMove];
    conditional.parameters!.condition = { kind: 'boolean', value: false };
    start.slots!.do = [conditional];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(1);
    const branch = result.program.instructions[0];
    if (branch.kind !== 'branch') {
      throw new Error('Expected a branch instruction.');
    }
    expect(branch.sourceBlockId).toBe(conditional.instanceId);
    expect(branch.whenTrue).toHaveLength(1);
    expect(branch.whenFalse).toHaveLength(1);
    expect(branch.whenTrue[0]?.sourceBlockId).toBe(thenTurn.instanceId);
    expect(branch.whenFalse[0]?.sourceBlockId).toBe(elseMove.instanceId);
    expect(branch.condition.literal?.value).toBe(false);
    expect(branch.condition.literal?.source).toBe('user');
    expect(result.diagnostics).toHaveLength(0);
  });

  it('resolves signal descriptors when compiling condition expressions', () => {
    const start = createBlockInstance('start');
    const conditional = createBlockInstance('if');
    conditional.expressionInputs!.condition = [createBlockInstance('read-signal')];
    conditional.slots!.then = [createBlockInstance('wait')];
    start.slots!.do = [conditional];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    const branch = result.program.instructions[0];
    if (branch.kind !== 'branch') {
      throw new Error('Expected a branch instruction.');
    }
    expect(branch.condition.expression?.kind).toBe('signal');
    if (branch.condition.expression?.kind === 'signal') {
      expect(branch.condition.expression.signal.id).toBe('status.signal.active');
    }
  });

  it('builds operator trees for repeat counts', () => {
    const start = createBlockInstance('start');
    const repeat = createBlockInstance('repeat');
    const add = createBlockInstance('operator-add');
    const literalOne = createBlockInstance('literal-number');
    const literalTwo = createBlockInstance('literal-number');

    literalOne.parameters!.value = { kind: 'number', value: 1 };
    literalTwo.parameters!.value = { kind: 'number', value: 2 };

    add.expressionInputs!.firstValue = [literalOne];
    add.expressionInputs!.secondValue = [literalTwo];
    repeat.expressionInputs!.count = [add];
    repeat.slots!.do = [createBlockInstance('move')];
    start.slots!.do = [repeat];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    const instruction = result.program.instructions[0];
    if (instruction.kind !== 'loop') {
      throw new Error('Expected a loop instruction.');
    }
    if (instruction.mode !== 'counted') {
      throw new Error('Expected a counted loop.');
    }
    const expression = instruction.iterations.expression;
    expect(expression?.kind).toBe('operator');
    if (expression?.kind === 'operator') {
      expect(expression.operator).toBe('add');
      for (const input of expression.inputs) {
        expect(input.kind).toBe('literal');
        if (input.kind === 'literal') {
          expect(input.source).toBe('user');
        }
      }
    }
  });

  it('warns when repeat counts fall below zero', () => {
    const start = createBlockInstance('start');
    const repeat = createBlockInstance('repeat');
    const move = createBlockInstance('move');
    repeat.slots!.do = [move];
    repeat.parameters!.count = { kind: 'number', value: -2 };
    start.slots!.do = [repeat];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(1);
    expect(result.diagnostics.some((diag) => diag.message.includes('must be at least'))).toBe(true);
  });
});
