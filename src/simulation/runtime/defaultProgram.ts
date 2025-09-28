import {
  createBooleanLiteralBinding,
  createNumberLiteralBinding,
  type CompiledProgram,
} from './blockProgram';

const TREE_SCAN_DURATION_SECONDS = 0.5;
const TRAVEL_DURATION_SECONDS = 8;
const TOOL_SWING_DURATION_SECONDS = 3;
const GATHER_DURATION_SECONDS = 1.5;
const RETURN_DURATION_SECONDS = 8;
const DEPOSIT_DURATION_SECONDS = 1;
const LOOP_PAUSE_SECONDS = 1;
const TREE_APPROACH_BUFFER_SECONDS = 0.5;

const PRIMARY_TREE_COORDINATES = { x: -340, y: -220 } as const;
const SECONDARY_TREE_COORDINATES = { x: 360, y: 260 } as const;

export const DEFAULT_STARTUP_PROGRAM: CompiledProgram = {
  instructions: [
    {
      kind: 'loop',
      mode: 'forever',
      instructions: [
        {
          kind: 'scan',
          duration: createNumberLiteralBinding(TREE_SCAN_DURATION_SECONDS, {
            label: 'Default Startup → scan for trees',
          }),
          filter: 'tree',
          sourceBlockId: 'default-startup-scan-for-trees',
        },
        {
          kind: 'move-to',
          duration: createNumberLiteralBinding(TRAVEL_DURATION_SECONDS, {
            label: 'Default Startup → travel to tree duration',
          }),
          speed: createNumberLiteralBinding(80, { label: 'Default Startup → travel speed' }),
          target: {
            useScanHit: createBooleanLiteralBinding(true, {
              label: 'Default Startup → use scan hit for tree',
            }),
            scanHitIndex: createNumberLiteralBinding(1, {
              label: 'Default Startup → scan hit index',
            }),
            literalPosition: {
              x: createNumberLiteralBinding(PRIMARY_TREE_COORDINATES.x, {
                label: 'Default Startup → fallback tree X',
              }),
              y: createNumberLiteralBinding(PRIMARY_TREE_COORDINATES.y, {
                label: 'Default Startup → fallback tree Y',
              }),
            },
          },
          sourceBlockId: 'default-startup-move-to-tree',
        },
        {
          kind: 'wait',
          duration: createNumberLiteralBinding(TREE_APPROACH_BUFFER_SECONDS, {
            label: 'Default Startup → settle before chopping',
          }),
          sourceBlockId: 'default-startup-settle-before-chop',
        },
        {
          kind: 'use-item',
          duration: createNumberLiteralBinding(TOOL_SWING_DURATION_SECONDS, {
            label: 'Default Startup → swing axe duration',
          }),
          slot: {
            index: createNumberLiteralBinding(1, { label: 'Default Startup → tool slot index' }),
            label: {
              value: 'Primary Tool',
              source: 'default',
              label: 'Default Startup → tool slot label',
            },
          },
          target: {
            useScanHit: createBooleanLiteralBinding(true, {
              label: 'Default Startup → use scan hit for swing',
            }),
            scanHitIndex: createNumberLiteralBinding(1, {
              label: 'Default Startup → swing scan hit index',
            }),
            literalPosition: {
              x: createNumberLiteralBinding(PRIMARY_TREE_COORDINATES.x, {
                label: 'Default Startup → swing fallback X',
              }),
              y: createNumberLiteralBinding(PRIMARY_TREE_COORDINATES.y, {
                label: 'Default Startup → swing fallback Y',
              }),
            },
          },
          sourceBlockId: 'default-startup-chop-tree',
        },
        {
          kind: 'gather',
          duration: createNumberLiteralBinding(GATHER_DURATION_SECONDS, {
            label: 'Default Startup → gather logs duration',
          }),
          target: 'auto',
          sourceBlockId: 'default-startup-gather-logs',
        },
        {
          kind: 'move-to',
          duration: createNumberLiteralBinding(RETURN_DURATION_SECONDS, {
            label: 'Default Startup → return duration',
          }),
          speed: createNumberLiteralBinding(80, { label: 'Default Startup → return speed' }),
          target: {
            useScanHit: createBooleanLiteralBinding(false, {
              label: 'Default Startup → use scan hit for return',
            }),
            scanHitIndex: createNumberLiteralBinding(1, {
              label: 'Default Startup → return scan hit index',
            }),
            literalPosition: {
              x: createNumberLiteralBinding(0, { label: 'Default Startup → origin X' }),
              y: createNumberLiteralBinding(0, { label: 'Default Startup → origin Y' }),
            },
          },
          sourceBlockId: 'default-startup-return-to-origin',
        },
        {
          kind: 'deposit',
          duration: createNumberLiteralBinding(DEPOSIT_DURATION_SECONDS, {
            label: 'Default Startup → deposit duration',
          }),
          sourceBlockId: 'default-startup-deposit-cargo',
        },
        {
          kind: 'move-to',
          duration: createNumberLiteralBinding(TRAVEL_DURATION_SECONDS, {
            label: 'Default Startup → secondary travel duration',
          }),
          speed: createNumberLiteralBinding(80, { label: 'Default Startup → secondary travel speed' }),
          target: {
            useScanHit: createBooleanLiteralBinding(false, {
              label: 'Default Startup → use scan hit for secondary tree',
            }),
            scanHitIndex: createNumberLiteralBinding(1, {
              label: 'Default Startup → secondary scan hit index',
            }),
            literalPosition: {
              x: createNumberLiteralBinding(SECONDARY_TREE_COORDINATES.x, {
                label: 'Default Startup → secondary fallback X',
              }),
              y: createNumberLiteralBinding(SECONDARY_TREE_COORDINATES.y, {
                label: 'Default Startup → secondary fallback Y',
              }),
            },
          },
          sourceBlockId: 'default-startup-move-to-secondary-tree',
        },
        {
          kind: 'wait',
          duration: createNumberLiteralBinding(LOOP_PAUSE_SECONDS, {
            label: 'Default Startup → loop pause',
          }),
          sourceBlockId: 'default-startup-loop-pause',
        },
      ],
      sourceBlockId: 'default-startup-harvest-loop',
    },
  ],
};

