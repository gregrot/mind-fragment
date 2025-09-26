import { useCallback, useEffect, useState } from 'react';
import { simulationRuntime } from '../state/simulationRuntime';
import type { EntityId } from '../simulation/ecs/world';

interface MechanismSelection {
  selectedMechanismId: string | null;
  selectedEntityId: EntityId | null;
  clearSelection: () => void;
}

export const useMechanismSelection = (): MechanismSelection => {
  const [selection, setSelection] = useState<{
    mechanismId: string | null;
    entityId: EntityId | null;
  }>(() => ({
    mechanismId: simulationRuntime.getSelectedMechanism(),
    entityId: simulationRuntime.getSelectedEntityId(),
  }));

  useEffect(
    () =>
      simulationRuntime.subscribeSelectedMechanism(({ mechanismId, entityId }) => {
        setSelection({ mechanismId, entityId });
      }),
    [],
  );

  const clearSelection = useCallback(() => {
    simulationRuntime.clearSelectedMechanism();
  }, []);

  return { selectedMechanismId: selection.mechanismId, selectedEntityId: selection.entityId, clearSelection };
};

export default useMechanismSelection;
