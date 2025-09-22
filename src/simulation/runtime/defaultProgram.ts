import type { CompiledProgram } from './blockProgram';

const BLINK_INTERVAL_SECONDS = 2;

export const DEFAULT_STARTUP_PROGRAM: CompiledProgram = {
  instructions: [
    {
      kind: 'loop',
      instructions: [
        { kind: 'status-toggle', duration: 0 },
        { kind: 'wait', duration: BLINK_INTERVAL_SECONDS },
      ],
    },
  ],
};

