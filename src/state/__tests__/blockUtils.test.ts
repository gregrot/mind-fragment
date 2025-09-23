import { describe, expect, it } from 'vitest';
import { insertBlock, removeBlock } from '../blockUtils';
import { createBlockInstance } from '../../blocks/library';
import type { BlockInstance, BlockParameterValue, DropTarget } from '../../types/blocks';

interface MockBlockOptions {
  slots?: Record<string, BlockInstance[]>;
  expressionInputs?: Record<string, BlockInstance[]>;
  parameters?: Record<string, BlockParameterValue>;
}

const createBlock = (instanceId: string, options: MockBlockOptions = {}): BlockInstance => ({
  instanceId,
  type: 'mock-block',
  ...(options.slots ? { slots: options.slots } : {}),
  ...(options.expressionInputs ? { expressionInputs: options.expressionInputs } : {}),
  ...(options.parameters ? { parameters: options.parameters } : {}),
});

describe('blockUtils', () => {
  it('inserts a block into the workspace at the requested position', () => {
    const blocks = [createBlock('a'), createBlock('b')];
    const blockToInsert = createBlock('c');
    const target: DropTarget = { kind: 'workspace', position: 1, ancestorIds: [] };

    const result = insertBlock(blocks, target, blockToInsert);

    expect(result.inserted).toBe(true);
    expect(result.blocks.map((block) => block.instanceId)).toEqual(['a', 'c', 'b']);
  });

  it('reorders an existing workspace block when reinserting at a different position', () => {
    const blocks = [createBlock('a'), createBlock('b'), createBlock('c')];

    const removal = removeBlock(blocks, 'b');
    expect(removal.removed?.instanceId).toBe('b');

    const target: DropTarget = { kind: 'workspace', position: 2, ancestorIds: [] };
    const insertion = insertBlock(removal.blocks, target, removal.removed!);

    expect(insertion.inserted).toBe(true);
    expect(insertion.blocks.map((block) => block.instanceId)).toEqual(['a', 'c', 'b']);
  });

  it('moves a block with its children into a new slot', () => {
    const grandchild = createBlock('grandchild');
    const child = createBlock('child', { slots: { chain: [grandchild] } });
    const sourceParent = createBlock('source-parent', { slots: { actions: [child] } });
    const destinationParent = createBlock('destination-parent', { slots: { actions: [] } });
    const workspace = [sourceParent, destinationParent];

    const removal = removeBlock(workspace, 'child');
    expect(removal.removed?.instanceId).toBe('child');
    expect(removal.removed?.slots?.chain?.[0]?.instanceId).toBe('grandchild');

    const target: DropTarget = {
      kind: 'slot',
      ownerId: 'destination-parent',
      slotName: 'actions',
      position: 0,
      ancestorIds: ['destination-parent'],
    };

    const insertion = insertBlock(removal.blocks, target, removal.removed!);

    expect(insertion.inserted).toBe(true);
    const destinationSlot = insertion.blocks[1]?.slots?.actions ?? [];
    expect(destinationSlot.map((block) => block.instanceId)).toEqual(['child']);
    expect(destinationSlot[0]?.slots?.chain?.[0]?.instanceId).toBe('grandchild');
    const sourceSlot = insertion.blocks[0]?.slots?.actions ?? [];
    expect(sourceSlot).toHaveLength(0);
  });

  it('allows inserting and removing blocks within parameter expression inputs', () => {
    const expressionBlock = createBlock('expression');
    const owner = createBlock('owner', { expressionInputs: { condition: [] } });
    const workspace = [owner];

    const target: DropTarget = {
      kind: 'parameter-expression',
      ownerId: 'owner',
      parameterName: 'condition',
      position: 0,
      ancestorIds: ['owner'],
    };

    const insertion = insertBlock(workspace, target, expressionBlock);
    expect(insertion.inserted).toBe(true);
    const inputBlocks = insertion.blocks[0]?.expressionInputs?.condition ?? [];
    expect(inputBlocks.map((block) => block.instanceId)).toEqual(['expression']);

    const removal = removeBlock(insertion.blocks, 'expression');
    expect(removal.removed?.instanceId).toBe('expression');
    expect(removal.blocks[0]?.expressionInputs?.condition).toEqual([]);
  });

  it('preserves parameter defaults when moving blocks between containers', () => {
    const statusBlock = createBlockInstance('set-status');
    const workspace: BlockInstance[] = [statusBlock];

    const removal = removeBlock(workspace, statusBlock.instanceId);
    expect(removal.removed?.parameters?.value).toEqual({ kind: 'boolean', value: true });

    const insertionTarget: DropTarget = { kind: 'workspace', position: 0, ancestorIds: [] };
    const insertion = insertBlock(removal.blocks, insertionTarget, removal.removed!);
    expect(insertion.inserted).toBe(true);
    expect(insertion.blocks[0]?.parameters?.value).toEqual({ kind: 'boolean', value: true });
  });

  it('seeds parameter defaults and expression containers for control blocks', () => {
    const repeat = createBlockInstance('repeat');
    expect(repeat.parameters?.count).toEqual({ kind: 'number', value: 3 });
    expect(repeat.expressionInputs?.count).toEqual([]);

    const conditional = createBlockInstance('if');
    expect(conditional.parameters?.condition).toEqual({ kind: 'boolean', value: true });
    expect(conditional.expressionInputs?.condition).toEqual([]);
  });
});
