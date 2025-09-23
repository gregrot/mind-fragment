import { describe, expect, it } from 'vitest';
import { compileWorkspaceProgram } from '../blockProgram';
import { createBlockInstance } from '../../../blocks/library';

const buildWorkspace = (...blocks: ReturnType<typeof createBlockInstance>[]) => blocks;

describe('compileWorkspaceProgram', () => {
  it('warns when no start block is present', () => {
    const result = compileWorkspaceProgram(buildWorkspace(createBlockInstance('move')));

    expect(result.program.instructions).toHaveLength(0);
    expect(result.diagnostics.some((diag) => diag.message.includes('When Started'))).toBe(true);
  });

  it('compiles a simple move routine', () => {
    const start = createBlockInstance('start');
    const move = createBlockInstance('move');
    const wait = createBlockInstance('wait');
    start.slots!.do = [move, wait];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toEqual([
      { kind: 'move', duration: 1, speed: expect.any(Number) },
      { kind: 'wait', duration: 1 },
    ]);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('emits scan and gather instructions', () => {
    const start = createBlockInstance('start');
    const scan = createBlockInstance('scan-resources');
    const gather = createBlockInstance('gather-resource');
    start.slots!.do = [scan, gather];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toEqual([
      { kind: 'scan', duration: expect.any(Number), filter: null },
      { kind: 'gather', duration: expect.any(Number), target: 'auto' },
    ]);
  });

  it('compiles status control blocks', () => {
    const start = createBlockInstance('start');
    const toggle = createBlockInstance('toggle-status');
    const setStatus = createBlockInstance('set-status');
    if (setStatus.parameters) {
      setStatus.parameters.value = { kind: 'boolean', value: false };
    }
    start.slots!.do = [toggle, setStatus];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toEqual([
      { kind: 'status-toggle', duration: 0 },
      { kind: 'status-set', duration: 0, value: false },
    ]);
  });

  it('wraps forever blocks in loop instructions so the runner can repeat them', () => {
    const start = createBlockInstance('start');
    const forever = createBlockInstance('forever');
    const gather = createBlockInstance('gather-resource');
    forever.slots!.do = [gather];
    start.slots!.do = [forever];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions).toHaveLength(1);
    expect(result.program.instructions[0]).toMatchObject({ kind: 'loop' });
    const loop = result.program.instructions[0];
    if (loop.kind !== 'loop') {
      throw new Error('Expected a loop instruction to be emitted.');
    }
    expect(loop.instructions).toHaveLength(1);
    expect(loop.instructions[0]).toMatchObject({ kind: 'gather', target: 'auto' });
  });

  it('expands repeat blocks three times by default', () => {
    const start = createBlockInstance('start');
    const repeat = createBlockInstance('repeat');
    const move = createBlockInstance('move');
    repeat.slots!.do = [move];
    start.slots!.do = [repeat];

    const result = compileWorkspaceProgram(buildWorkspace(start));
    expect(result.program.instructions).toHaveLength(3);
    expect(
      result.diagnostics.some((diag) => diag.message.includes('configured number of times')),
    ).toBe(true);
  });

  it('runs parallel branches sequentially', () => {
    const start = createBlockInstance('start');
    const parallel = createBlockInstance('parallel');
    const move = createBlockInstance('move');
    const turn = createBlockInstance('turn');
    parallel.slots!.branchA = [move];
    parallel.slots!.branchB = [turn];
    start.slots!.do = [parallel];

    const result = compileWorkspaceProgram(buildWorkspace(start));
    expect(result.program.instructions.map((instruction) => instruction.kind)).toEqual(['move', 'turn']);
  });

  it('compiles the THEN branch of conditionals with a placeholder diagnostic', () => {
    const start = createBlockInstance('start');
    const conditional = createBlockInstance('if');
    const thenTurn = createBlockInstance('turn');
    const elseMove = createBlockInstance('move');

    conditional.slots!.then = [thenTurn];
    conditional.slots!.else = [elseMove];
    start.slots!.do = [conditional];

    const result = compileWorkspaceProgram(buildWorkspace(start));

    expect(result.program.instructions.map((instruction) => instruction.kind)).toEqual(['turn']);
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('Conditionals'))).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.message.includes('Else branches'))).toBe(true);
  });
});
