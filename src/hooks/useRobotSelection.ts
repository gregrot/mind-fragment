import { useCallback, useEffect, useState } from 'react';
import { simulationRuntime } from '../state/simulationRuntime';

interface RobotSelection {
  selectedRobotId: string | null;
  clearSelection: () => void;
}

export const useRobotSelection = (): RobotSelection => {
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(simulationRuntime.getSelectedRobot());

  useEffect(() => simulationRuntime.subscribeSelectedRobot(setSelectedRobotId), []);

  const clearSelection = useCallback(() => {
    simulationRuntime.clearSelectedRobot();
  }, []);

  return { selectedRobotId, clearSelection };
};

export default useRobotSelection;
