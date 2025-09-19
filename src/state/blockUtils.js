const clampIndex = (index, length) => {
  const upper = typeof index === 'number' ? index : length;
  if (Number.isNaN(upper)) {
    return length;
  }
  return Math.max(0, Math.min(upper, length));
};

export function removeBlock(blocks, instanceId) {
  const result = removeFromBlocks(blocks, instanceId);
  return {
    blocks: result.changed ? result.blocks : blocks,
    removed: result.removed
  };
}

function removeFromBlocks(blocks, instanceId) {
  let removed = null;
  let changed = false;
  const nextBlocks = [];

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
      const nextSlots = {};
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
}

export function insertBlock(blocks, target, blockToInsert) {
  const result = insertIntoBlocks(blocks, target, blockToInsert);
  return {
    blocks: result.inserted ? result.blocks : blocks,
    inserted: result.inserted
  };
}

function insertIntoBlocks(blocks, target, blockToInsert) {
  if (target.kind === 'workspace') {
    const nextBlocks = [...blocks];
    const insertionIndex = clampIndex(target.position, nextBlocks.length);
    nextBlocks.splice(insertionIndex, 0, blockToInsert);
    return { blocks: nextBlocks, inserted: true };
  }

  let inserted = false;
  const nextBlocks = [];

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
      const updatedBlock = {
        ...block,
        slots: {
          ...block.slots,
          [target.slotName]: updatedSlotBlocks
        }
      };
      nextBlocks.push(updatedBlock);
      inserted = true;
      continue;
    }

    if (!block.slots) {
      nextBlocks.push(block);
      continue;
    }

    const nextSlots = {};
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
}
