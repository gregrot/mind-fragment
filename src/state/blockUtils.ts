import type { BlockInstance, DropTarget } from '../types/blocks';

const clampIndex = (index: number | undefined, length: number): number => {
  const upper = typeof index === 'number' ? index : length;
  if (Number.isNaN(upper)) {
    return length;
  }
  return Math.max(0, Math.min(upper, length));
};

interface RemoveResult {
  blocks: BlockInstance[];
  removed: BlockInstance | null;
  changed: boolean;
}

const removeFromBlocks = (blocks: BlockInstance[], instanceId: string): RemoveResult => {
  let removed: BlockInstance | null = null;
  let changed = false;
  const nextBlocks: BlockInstance[] = [];

  for (const block of blocks) {
    if (removed) {
      nextBlocks.push(block);
      continue;
    }

    if (block.instanceId === instanceId) {
      removed = block;
      changed = true;
      continue;
    }

    if (block.slots) {
      const nextSlots: Record<string, BlockInstance[]> = {};
      let slotChanged = false;

      for (const [slotName, slotBlocks] of Object.entries(block.slots)) {
        const result = removeFromBlocks(slotBlocks, instanceId);
        if (result.removed && !removed) {
          removed = result.removed;
        }
        if (result.changed) {
          slotChanged = true;
        }
        nextSlots[slotName] = result.changed ? result.blocks : slotBlocks;
      }

      if (slotChanged) {
        nextBlocks.push({ ...block, slots: nextSlots });
        changed = true;
        continue;
      }
    }

    nextBlocks.push(block);
  }

  return { blocks: nextBlocks, removed, changed };
};

export const removeBlock = (
  blocks: BlockInstance[],
  instanceId: string,
): { blocks: BlockInstance[]; removed: BlockInstance | null } => {
  const result = removeFromBlocks(blocks, instanceId);
  return {
    blocks: result.changed ? result.blocks : blocks,
    removed: result.removed,
  };
};

interface InsertResult {
  blocks: BlockInstance[];
  inserted: boolean;
}

const insertIntoBlocks = (
  blocks: BlockInstance[],
  target: DropTarget,
  blockToInsert: BlockInstance,
): InsertResult => {
  if (target.kind === 'workspace') {
    const nextBlocks = [...blocks];
    const insertionIndex = clampIndex(target.position, nextBlocks.length);
    nextBlocks.splice(insertionIndex, 0, blockToInsert);
    return { blocks: nextBlocks, inserted: true };
  }

  let inserted = false;
  const nextBlocks: BlockInstance[] = [];

  for (const block of blocks) {
    if (inserted) {
      nextBlocks.push(block);
      continue;
    }

    if (block.instanceId === target.ownerId) {
      const slotBlocks = block.slots?.[target.slotName] ?? [];
      const insertionIndex = clampIndex(target.position, slotBlocks.length);
      const updatedSlotBlocks = [...slotBlocks];
      updatedSlotBlocks.splice(insertionIndex, 0, blockToInsert);
      const updatedBlock: BlockInstance = {
        ...block,
        slots: {
          ...(block.slots ?? {}),
          [target.slotName]: updatedSlotBlocks,
        },
      };
      nextBlocks.push(updatedBlock);
      inserted = true;
      continue;
    }

    if (!block.slots) {
      nextBlocks.push(block);
      continue;
    }

    const nextSlots: Record<string, BlockInstance[]> = {};
    let slotChanged = false;

    for (const [slotName, slotBlocks] of Object.entries(block.slots)) {
      if (inserted) {
        nextSlots[slotName] = slotBlocks;
        continue;
      }

      const result = insertIntoBlocks(slotBlocks, target, blockToInsert);
      if (result.inserted) {
        inserted = true;
        slotChanged = true;
        nextSlots[slotName] = result.blocks;
      } else {
        nextSlots[slotName] = slotBlocks;
      }
    }

    if (slotChanged) {
      nextBlocks.push({ ...block, slots: nextSlots });
    } else {
      nextBlocks.push(block);
    }
  }

  if (inserted) {
    return { blocks: nextBlocks, inserted: true };
  }

  return { blocks, inserted: false };
};

export const insertBlock = (
  blocks: BlockInstance[],
  target: DropTarget,
  blockToInsert: BlockInstance,
): { blocks: BlockInstance[]; inserted: boolean } => {
  const result = insertIntoBlocks(blocks, target, blockToInsert);
  return {
    blocks: result.inserted ? result.blocks : blocks,
    inserted: result.inserted,
  };
};

const updateBlocks = (
  blocks: BlockInstance[],
  instanceId: string,
  updater: (block: BlockInstance) => BlockInstance,
): { blocks: BlockInstance[]; changed: boolean } => {
  let changed = false;
  const nextBlocks = blocks.map((block) => {
    if (changed) {
      return block;
    }

    if (block.instanceId === instanceId) {
      changed = true;
      return updater(block);
    }

    if (!block.slots) {
      return block;
    }

    const nextSlots: Record<string, BlockInstance[]> = {};
    let slotChanged = false;
    for (const [slotName, slotBlocks] of Object.entries(block.slots)) {
      const result = updateBlocks(slotBlocks, instanceId, updater);
      if (result.changed) {
        slotChanged = true;
        nextSlots[slotName] = result.blocks;
      } else {
        nextSlots[slotName] = slotBlocks;
      }
    }

    if (!slotChanged) {
      return block;
    }

    changed = true;
    return {
      ...block,
      slots: nextSlots,
    };
  });

  return { blocks: changed ? nextBlocks : blocks, changed };
};

export const updateBlock = (
  blocks: BlockInstance[],
  instanceId: string,
  updater: (block: BlockInstance) => BlockInstance,
): { blocks: BlockInstance[]; changed: boolean } => updateBlocks(blocks, instanceId, updater);
