import { useEffect, useState } from 'react';
import type { ModuleStateSnapshot } from '../simulation/robot/RobotChassis';
import { simulationRuntime } from '../state/simulationRuntime';

export const useModuleState = (): ModuleStateSnapshot => {
  const [snapshot, setSnapshot] = useState<ModuleStateSnapshot>(
    simulationRuntime.getModuleStateSnapshot(),
  );

  useEffect(() => simulationRuntime.subscribeModuleState(setSnapshot), []);

  return snapshot;
};

export default useModuleState;
