import { useCallback, useEffect, useState } from 'react';
import type { CompiledProgram } from '../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import { simulationRuntime } from '../state/simulationRuntime';

export interface SimulationRuntimeControls {
  status: ProgramRunnerStatus;
  runProgram: (program: CompiledProgram) => void;
  stopProgram: () => void;
}

export const useSimulationRuntime = (robotId: string): SimulationRuntimeControls => {
  const [status, setStatus] = useState<ProgramRunnerStatus>(simulationRuntime.getStatus(robotId));

  useEffect(() => simulationRuntime.subscribeStatus(robotId, setStatus), [robotId]);

  useEffect(() => {
    setStatus(simulationRuntime.getStatus(robotId));
  }, [robotId]);

  const runProgram = useCallback((program: CompiledProgram) => {
    simulationRuntime.runProgram(robotId, program);
  }, [robotId]);

  const stopProgram = useCallback(() => {
    simulationRuntime.stopProgram(robotId);
  }, [robotId]);

  return {
    status,
    runProgram,
    stopProgram,
  };
};
