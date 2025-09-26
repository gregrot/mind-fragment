import { useEffect, useState } from 'react';
import type { EntityId } from '../simulation/ecs/world';
import {
  useEntityOverlayManager,
  type EntityPersistenceState,
} from '../state/EntityOverlayManager';

const IDLE_STATE: EntityPersistenceState = { status: 'idle', error: null };

const useEntityPersistenceState = (
  entityId: EntityId | null | undefined,
): EntityPersistenceState => {
  const { subscribe, getPersistenceState } = useEntityOverlayManager();
  const [state, setState] = useState<EntityPersistenceState>(() => {
    if (entityId == null) {
      return IDLE_STATE;
    }
    return getPersistenceState(entityId);
  });

  useEffect(() => {
    if (entityId == null) {
      setState(IDLE_STATE);
      return;
    }

    setState(getPersistenceState(entityId));

    const unsubscribe = subscribe((event) => {
      if ('entityId' in event && event.entityId === entityId) {
        setState(getPersistenceState(entityId));
      }
    });

    return unsubscribe;
  }, [entityId, getPersistenceState, subscribe]);

  return state;
};

export default useEntityPersistenceState;
