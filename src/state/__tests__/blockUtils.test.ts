import { describe, expect, it } from 'vitest';
import { insertBlock, removeBlock } from '../blockUtils';
import type { BlockInstance, DropTarget } from '../../types/blocks';

const createBlock = (instanceId: string, slots?: Record<string, BlockInstance[]>): BlockInstance => ({
  instanceId,
  type: 'mock-block',
  ...(slots ? { slots } : {}),
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
    const child = createBlock('child', { chain: [grandchild] });
    const sourceParent = createBlock('source-parent', { actions: [child] });
    const destinationParent = createBlock('destination-parent', { actions: [] });
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
});
