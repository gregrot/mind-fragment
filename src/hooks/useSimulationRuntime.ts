import { useCallback, useEffect, useState } from 'react';
import type { CompiledProgram } from '../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import { simulationRuntime } from '../state/simulationRuntime';

export interface SimulationRuntimeControls {
  status: ProgramRunnerStatus;
  runProgram: (program: CompiledProgram) => void;
  stopProgram: () => void;
}

export const useSimulationRuntime = (): SimulationRuntimeControls => {
  const [status, setStatus] = useState<ProgramRunnerStatus>(simulationRuntime.getStatus());

  useEffect(() => simulationRuntime.subscribe(setStatus), []);

  const runProgram = useCallback((program: CompiledProgram) => {
    simulationRuntime.runProgram(program);
  }, []);

  const stopProgram = useCallback(() => {
    simulationRuntime.stopProgram();
  }, []);

  return {
    status,
    runProgram,
    stopProgram,
  };
};
