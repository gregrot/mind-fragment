import type { BlockDefinition, BlockInstance } from '../types/blocks';

let blockCounter = 0;

const SIGNAL_OPTIONS = [
  { id: 'status.signal.active', label: 'Status Indicator – Active' },
  { id: 'alert.signal', label: 'Alert Beacon' },
  { id: 'ping.signal', label: 'Ping Sweep' },
];

export const BLOCK_LIBRARY: BlockDefinition[] = [
  {
    id: 'start',
    label: 'When Started',
    category: 'event',
    slots: ['do'],
    summary: 'Entry point that fires once when the scene begins.',
    paletteGroup: 'Events',
  },
  {
    id: 'move',
    label: 'Move Forward',
    category: 'action',
    summary: 'Move the actor forward by one unit.',
    paletteGroup: 'Actions',
  },
  {
    id: 'move-to',
    label: 'Move To Target',
    category: 'action',
    summary:
      'Travel towards the most recent scan result, or fall back to a specified coordinate when no survey data exists.',
    parameters: {
      useScanHit: { kind: 'boolean', defaultValue: true },
      scanHitIndex: { kind: 'number', defaultValue: 1, min: 1, step: 1 },
      targetX: { kind: 'number', defaultValue: 0 },
      targetY: { kind: 'number', defaultValue: 0 },
      speed: { kind: 'number', defaultValue: 80 },
    },
    expressionInputs: ['useScanHit', 'scanHitIndex', 'targetX', 'targetY', 'speed'],
    expressionInputDefaults: {
      useScanHit: ['literal-boolean'],
      scanHitIndex: ['literal-number'],
      targetX: ['literal-number'],
      targetY: ['literal-number'],
      speed: ['literal-number'],
    },
    paletteGroup: 'Motor',
    paletteTags: ['navigation', 'movement', 'motor'],
  },
  {
    id: 'turn',
    label: 'Turn Left',
    category: 'action',
    summary: 'Rotate the actor 90° counter-clockwise.',
    paletteGroup: 'Actions',
  },
  {
    id: 'wait',
    label: 'Wait',
    category: 'action',
    summary: 'Pause the routine for a single beat.',
    paletteGroup: 'Actions',
  },
  {
    id: 'scan-resources',
    label: 'Scan Area',
    category: 'action',
    summary: 'Trigger the survey scanner to look for nearby resource nodes.',
    paletteGroup: 'Actions',
  },
  {
    id: 'toggle-status',
    label: 'Toggle Status',
    category: 'action',
    summary: 'Flip the status indicator between on and off states.',
    paletteGroup: 'Actions',
  },
  {
    id: 'set-status',
    label: 'Set Status (true/false)',
    category: 'action',
    summary: 'Explicitly set the status indicator to on or off.',
    parameters: {
      value: { kind: 'boolean', defaultValue: true },
    },
    expressionInputs: ['value'],
    expressionInputDefaults: {
      value: ['literal-boolean'],
    },
    paletteGroup: 'Actions',
  },
  {
    id: 'broadcast-signal',
    label: 'Broadcast Signal',
    category: 'action',
    summary: 'Emit one of the mechanism signals onto the shared channel.',
    parameters: {
      signal: {
        kind: 'signal',
        defaultValue: 'status.signal.active',
        allowNone: false,
        options: SIGNAL_OPTIONS,
      },
    },
    paletteGroup: 'Actions',
  },
  {
    id: 'gather-resource',
    label: 'Gather Resource',
    category: 'action',
    summary: 'Harvest the closest detected resource node and store it in cargo.',
    paletteGroup: 'Actions',
  },
  {
    id: 'use-item-slot',
    label: 'Use Tool Slot',
    category: 'action',
    summary:
      'Activate a tool stored in a specific inventory slot, preferring the latest scanned resource target.',
    parameters: {
      slotIndex: { kind: 'number', defaultValue: 1, min: 1, step: 1 },
      slotLabel: { kind: 'string', defaultValue: 'Primary Tool' },
      useScanHit: { kind: 'boolean', defaultValue: true },
      scanHitIndex: { kind: 'number', defaultValue: 1, min: 1, step: 1 },
      targetX: { kind: 'number', defaultValue: 0 },
      targetY: { kind: 'number', defaultValue: 0 },
    },
    expressionInputs: ['slotIndex', 'useScanHit', 'scanHitIndex', 'targetX', 'targetY'],
    expressionInputDefaults: {
      slotIndex: ['literal-number'],
      useScanHit: ['literal-boolean'],
      scanHitIndex: ['literal-number'],
      targetX: ['literal-number'],
      targetY: ['literal-number'],
    },
    paletteGroup: 'Actions',
    paletteTags: ['manipulation', 'tool', 'resource'],
  },
  {
    id: 'return-home',
    label: 'Return to Core',
    category: 'action',
    summary: 'Navigate back to the Mind Fragment to offload gathered scrap.',
    paletteGroup: 'Actions',
  },
  {
    id: 'deposit-cargo',
    label: 'Deposit Cargo',
    category: 'action',
    summary: 'Transfer stored resources into the assembler reserves.',
    paletteGroup: 'Actions',
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
    expressionInputDefaults: {
      count: ['literal-number'],
    },
    paletteGroup: 'Control',
    paletteTags: ['loop'],
  },
  {
    id: 'forever',
    label: 'Forever',
    category: 'c',
    slots: ['do'],
    summary: 'Loop the enclosed blocks without end.',
    paletteGroup: 'Control',
    paletteTags: ['loop'],
  },
  {
    id: 'parallel',
    label: 'Parallel',
    category: 'c',
    slots: ['branchA', 'branchB'],
    summary: 'Execute the A and B branches side by side.',
    paletteGroup: 'Control',
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
    expressionInputDefaults: {
      condition: ['literal-boolean'],
    },
    paletteGroup: 'Control',
    paletteTags: ['logic'],
  },
  {
    id: 'literal-number',
    label: 'Number Literal',
    category: 'value',
    summary: 'Outputs the configured numeric value for use in expressions.',
    parameters: {
      value: { kind: 'number', defaultValue: 0 },
    },
    paletteGroup: 'Values & Signals',
    paletteTags: ['value', 'number', 'literal', 'constant'],
  },
  {
    id: 'literal-boolean',
    label: 'Boolean Literal',
    category: 'value',
    summary: 'Outputs a fixed true or false value for conditionals.',
    parameters: {
      value: { kind: 'boolean', defaultValue: true },
    },
    paletteGroup: 'Values & Signals',
    paletteTags: ['value', 'boolean', 'literal', 'logic'],
  },
  {
    id: 'read-signal',
    label: 'Read Signal',
    category: 'value',
    summary: 'Returns the most recent value reported by a selected mechanism signal.',
    parameters: {
      signal: {
        kind: 'signal',
        defaultValue: 'status.signal.active',
        allowNone: false,
        options: SIGNAL_OPTIONS,
      },
    },
    paletteGroup: 'Values & Signals',
    paletteTags: ['value', 'signal', 'sensor', 'status'],
  },
  {
    id: 'operator-add',
    label: 'Add Numbers',
    category: 'operator',
    summary: 'Outputs the sum of two number inputs.',
    expressionInputs: ['firstValue', 'secondValue'],
    expressionInputDefaults: {
      firstValue: ['literal-number'],
      secondValue: ['literal-number'],
    },
    paletteGroup: 'Operators',
    paletteTags: ['operator', 'math', 'arithmetic'],
  },
  {
    id: 'operator-greater-than',
    label: 'Greater Than',
    category: 'operator',
    summary: 'Returns true when the first number is greater than the second.',
    expressionInputs: ['firstValue', 'secondValue'],
    expressionInputDefaults: {
      firstValue: ['literal-number'],
      secondValue: ['literal-number'],
    },
    paletteGroup: 'Operators',
    paletteTags: ['operator', 'comparison', 'logic'],
  },
  {
    id: 'operator-and',
    label: 'Logical AND',
    category: 'operator',
    summary: 'Outputs true only when both boolean inputs evaluate to true.',
    expressionInputs: ['firstValue', 'secondValue'],
    expressionInputDefaults: {
      firstValue: ['literal-boolean'],
      secondValue: ['literal-boolean'],
    },
    paletteGroup: 'Operators',
    paletteTags: ['operator', 'logic', 'boolean'],
  },
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
          case 'signal': {
            const fallbackValue =
              typeof parameterDefinition.defaultValue === 'string'
                ? parameterDefinition.defaultValue
                : parameterDefinition.allowNone === false && parameterDefinition.options.length > 0
                  ? parameterDefinition.options[0]?.id ?? null
                  : null;

            accumulator[parameterName] = {
              kind: 'signal',
              value: fallbackValue,
            };
            break;
          }
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

  if (definition.expressionInputDefaults && instance.expressionInputs) {
    for (const [inputName, defaultBlockTypes] of Object.entries(definition.expressionInputDefaults)) {
      const target = instance.expressionInputs[inputName];
      if (!target) {
        continue;
      }

      for (const blockType of defaultBlockTypes) {
        if (!BLOCK_MAP[blockType]) {
          continue;
        }

        const expressionBlock = createBlockInstance(blockType);
        target.push(expressionBlock);

        const parentParameter = instance.parameters?.[inputName];
        const expressionParameters = expressionBlock.parameters;
        const expressionValue = expressionParameters?.value;

        if (parentParameter && expressionParameters && expressionValue) {
          switch (parentParameter.kind) {
            case 'number':
              if (expressionValue.kind === 'number') {
                expressionParameters.value = {
                  kind: 'number',
                  value: parentParameter.value,
                };
              }
              break;
            case 'boolean':
              if (expressionValue.kind === 'boolean') {
                expressionParameters.value = {
                  kind: 'boolean',
                  value: parentParameter.value,
                };
              }
              break;
            case 'string':
            case 'signal':
              break;
          }
        }
      }
    }
  }

  return instance;
}
