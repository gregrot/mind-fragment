import type { CompiledProgram } from './blockProgram';
import serializedProgram from './defaultStartupProgram.serialized.json';

export const DEFAULT_STARTUP_PROGRAM: CompiledProgram = serializedProgram as CompiledProgram;
