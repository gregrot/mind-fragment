import type { CompiledProgram } from './blockProgram';

const MOVE_DURATION = 1;
const MOVE_SPEED = 80;
const TURN_DURATION = 1;
const TURN_RATE = Math.PI / 2;
const SCAN_DURATION = 1;
const GATHER_DURATION = 1.5;
const WAIT_DURATION = 1;

export const DEFAULT_STARTUP_PROGRAM: CompiledProgram = {
  instructions: [
    { kind: 'scan', duration: SCAN_DURATION, filter: null },
    {
      kind: 'loop',
      instructions: [
        { kind: 'move', duration: MOVE_DURATION, speed: MOVE_SPEED },
        { kind: 'gather', duration: GATHER_DURATION, target: 'auto' },
        { kind: 'turn', duration: TURN_DURATION, angularVelocity: TURN_RATE / 2 },
        { kind: 'wait', duration: WAIT_DURATION },
        { kind: 'move', duration: MOVE_DURATION, speed: MOVE_SPEED },
        { kind: 'turn', duration: TURN_DURATION, angularVelocity: -TURN_RATE / 2 },
      ],
    },
  ],
};

