import { useCallback, useEffect, useState } from 'react';
import { simulationRuntime } from '../state/simulationRuntime';
import type { EntityId } from '../simulation/ecs/world';

interface RobotSelection {
  selectedRobotId: string | null;
  selectedEntityId: EntityId | null;
  clearSelection: () => void;
}

export const useRobotSelection = (): RobotSelection => {
  const [selection, setSelection] = useState<{
    robotId: string | null;
    entityId: EntityId | null;
  }>(() => ({
    robotId: simulationRuntime.getSelectedRobot(),
    entityId: simulationRuntime.getSelectedEntityId(),
  }));

  useEffect(
    () =>
      simulationRuntime.subscribeSelectedRobot(({ robotId, entityId }) => {
        setSelection({ robotId, entityId });
      }),
    [],
  );

  const clearSelection = useCallback(() => {
    simulationRuntime.clearSelectedRobot();
  }, []);

  return { selectedRobotId: selection.robotId, selectedEntityId: selection.entityId, clearSelection };
};

export default useRobotSelection;
