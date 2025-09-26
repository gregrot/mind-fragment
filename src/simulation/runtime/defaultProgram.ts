import { createNumberLiteralBinding, type CompiledProgram } from './blockProgram';

const BLINK_INTERVAL_SECONDS = 2;

export const DEFAULT_STARTUP_PROGRAM: CompiledProgram = {
  instructions: [
    {
      kind: 'loop',
      mode: 'forever',
      instructions: [
        {
          kind: 'status-toggle',
          duration: createNumberLiteralBinding(0, { label: 'Startup → toggle' }),
          sourceBlockId: 'default-startup-toggle',
        },
        {
          kind: 'wait',
          duration: createNumberLiteralBinding(BLINK_INTERVAL_SECONDS, { label: 'Startup → wait' }),
          sourceBlockId: 'default-startup-wait',
        },
      ],
      sourceBlockId: 'default-startup-loop',
    },
  ],
};

