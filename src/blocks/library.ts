import type { BlockDefinition, BlockInstance } from '../types/blocks';

let blockCounter = 0;

export const BLOCK_LIBRARY: BlockDefinition[] = [
  {
    id: 'start',
    label: 'When Started',
    category: 'event',
    slots: ['do'],
    summary: 'Entry point that fires once when the scene begins.'
  },
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
    id: 'wait',
    label: 'Wait',
    category: 'action',
    summary: 'Pause the routine for a single beat.'
  },
  {
    id: 'scan-resources',
    label: 'Scan Area',
    category: 'action',
    summary: 'Trigger the survey scanner to look for nearby resource nodes.'
  },
  {
    id: 'toggle-status',
    label: 'Toggle Status',
    category: 'action',
    summary: 'Flip the status indicator between on and off states.'
  },
  {
    id: 'set-status',
    label: 'Set Status (true/false)',
    category: 'action',
    summary: 'Explicitly set the status indicator to on or off.',
    parameters: {
      value: { kind: 'boolean', defaultValue: true },
    },
  },
  {
    id: 'broadcast-signal',
    label: 'Broadcast Signal',
    category: 'action',
    summary: 'Emit one of the robot signals onto the shared channel.',
    parameters: {
      signal: {
        kind: 'signal',
        defaultValue: 'status.signal.active',
        allowNone: false,
        options: [
          { id: 'status.signal.active', label: 'Status Indicator – Active' },
          { id: 'alert.signal', label: 'Alert Beacon' },
          { id: 'ping.signal', label: 'Ping Sweep' },
        ],
      },
    },
  },
  {
    id: 'gather-resource',
    label: 'Gather Resource',
    category: 'action',
    summary: 'Harvest the closest detected resource node and store it in cargo.'
  },
  {
    id: 'return-home',
    label: 'Return to Core',
    category: 'action',
    summary: 'Navigate back to the Mind Fragment to offload gathered scrap.'
  },
  {
    id: 'deposit-cargo',
    label: 'Deposit Cargo',
    category: 'action',
    summary: 'Transfer stored resources into the assembler reserves.'
  },
  {
    id: 'repeat',
    label: 'Repeat',
    category: 'c',
    slots: ['do'],
    summary: 'Run the enclosed blocks a number of times.',
    parameters: {
      count: { kind: 'number', defaultValue: 3 },
    },
    expressionInputs: ['count'],
  },
  {
    id: 'forever',
    label: 'Forever',
    category: 'c',
    slots: ['do'],
    summary: 'Loop the enclosed blocks without end.'
  },
  {
    id: 'parallel',
    label: 'Parallel',
    category: 'c',
    slots: ['branchA', 'branchB'],
    summary: 'Execute the A and B branches side by side.'
  },
  {
    id: 'if',
    label: 'If',
    category: 'c',
    slots: ['then', 'else'],
    summary: 'Branch into THEN or ELSE slots based on a condition.',
    parameters: {
      condition: { kind: 'boolean', defaultValue: true },
    },
    expressionInputs: ['condition'],
  }
];

export const BLOCK_MAP: Record<string, BlockDefinition> = BLOCK_LIBRARY.reduce(
  (accumulator, block) => {
    accumulator[block.id] = block;
    return accumulator;
  },
  {} as Record<string, BlockDefinition>,
);

export function createBlockInstance(blockType: string): BlockInstance {
  const definition = BLOCK_MAP[blockType];
  if (!definition) {
    throw new Error(`Unknown block type: ${blockType}`);
  }

  blockCounter += 1;
  const instance: BlockInstance = {
    instanceId: `block-${blockCounter}`,
    type: definition.id,
  };

  if (definition.parameters) {
    instance.parameters = Object.entries(definition.parameters).reduce(
      (accumulator, [parameterName, parameterDefinition]) => {
        switch (parameterDefinition.kind) {
          case 'boolean':
            accumulator[parameterName] = {
              kind: 'boolean',
              value: parameterDefinition.defaultValue,
            };
            break;
          case 'number':
            accumulator[parameterName] = {
              kind: 'number',
              value: parameterDefinition.defaultValue,
            };
            break;
          case 'string':
            accumulator[parameterName] = {
              kind: 'string',
              value: parameterDefinition.defaultValue,
            };
            break;
          case 'signal':
            accumulator[parameterName] = {
              kind: 'signal',
              value:
                typeof parameterDefinition.defaultValue === 'string'
                  ? parameterDefinition.defaultValue
                  : null,
            };
            break;
          case 'operator':
            break;
        }
        return accumulator;
      },
      {} as Record<string, NonNullable<BlockInstance['parameters']>[string]>,
    );
  }

  if (definition.slots) {
    instance.slots = definition.slots.reduce<Record<string, BlockInstance[]>>(
      (slots, slotName) => {
        slots[slotName] = [];
        return slots;
      },
      {},
    );
  }

  if (definition.expressionInputs) {
    instance.expressionInputs = definition.expressionInputs.reduce<Record<string, BlockInstance[]>>(
      (inputs, inputName) => {
        inputs[inputName] = [];
        return inputs;
      },
      {},
    );
  }

  return instance;
}
