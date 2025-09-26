import { useCallback, useEffect, useState } from 'react';
import type { CompiledProgram } from '../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import { simulationRuntime } from '../state/simulationRuntime';

export interface SimulationRuntimeControls {
  status: ProgramRunnerStatus;
  runProgram: (program: CompiledProgram) => void;
  stopProgram: () => void;
}

export const useSimulationRuntime = (mechanismId: string): SimulationRuntimeControls => {
  const [status, setStatus] = useState<ProgramRunnerStatus>(simulationRuntime.getStatus(mechanismId));

  useEffect(() => simulationRuntime.subscribeStatus(mechanismId, setStatus), [mechanismId]);

  useEffect(() => {
    setStatus(simulationRuntime.getStatus(mechanismId));
  }, [mechanismId]);

  const runProgram = useCallback((program: CompiledProgram) => {
    simulationRuntime.runProgram(mechanismId, program);
  }, [mechanismId]);

  const stopProgram = useCallback(() => {
    simulationRuntime.stopProgram(mechanismId);
  }, [mechanismId]);

  return {
    status,
    runProgram,
    stopProgram,
  };
};
