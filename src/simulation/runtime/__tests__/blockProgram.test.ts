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

  it('expands repeat blocks three times by default', () => {
    const start = createBlockInstance('start');
    const repeat = createBlockInstance('repeat');
    const move = createBlockInstance('move');
    repeat.slots!.do = [move];
    start.slots!.do = [repeat];

    const result = compileWorkspaceProgram(buildWorkspace(start));
    expect(result.program.instructions).toHaveLength(3);
    expect(result.diagnostics.some((diag) => diag.message.includes('loop three times'))).toBe(true);
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
});
