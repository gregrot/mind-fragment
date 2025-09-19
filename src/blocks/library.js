let blockCounter = 0;

export const BLOCK_LIBRARY = [
  {
    id: 'move',
    label: 'Move Forward',
    category: 'action',
    summary: 'Move the actor forward by one unit.'
  },
  {
    id: 'turn',
    label: 'Turn Left',
    category: 'action',
    summary: 'Rotate the actor 90° counter-clockwise.'
  },
  {
    id: 'repeat',
    label: 'Repeat',
    category: 'c',
    slots: ['do'],
    summary: 'Run the enclosed blocks a number of times.'
  },
  {
    id: 'if',
    label: 'If',
    category: 'c',
    slots: ['then', 'else'],
    summary: 'Branch into THEN or ELSE slots based on a condition.'
  }
];

export const BLOCK_MAP = BLOCK_LIBRARY.reduce((acc, block) => {
  acc[block.id] = block;
  return acc;
}, {});

export function createBlockInstance(blockType) {
  const definition = BLOCK_MAP[blockType];
  if (!definition) {
    throw new Error(`Unknown block type: ${blockType}`);
  }

  blockCounter += 1;
  const instance = {
    instanceId: `block-${blockCounter}`,
    type: definition.id
  };

  if (definition.slots) {
    instance.slots = definition.slots.reduce((slots, slotName) => {
      slots[slotName] = [];
      return slots;
    }, {});
  }

  return instance;
}
