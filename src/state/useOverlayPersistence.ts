import { useCallback, useEffect, useRef } from 'react';
import type { EntityId } from '../simulation/ecs/world';
import type { EntityOverlayData } from '../types/overlay';
import type {
  EntityOverlayAction,
  EntityOverlayEvent,
  EntityPersistenceState,
  OverlayChangeEvent,
} from './EntityOverlayManager';
import type { OverlayPersistenceAdapter } from './overlayPersistence';

interface UseOverlayPersistenceArgs {
  adapter: OverlayPersistenceAdapter;
  dispatch: (action: EntityOverlayAction) => void;
  emitEvent: (event: EntityOverlayEvent) => void;
  getEntityData: (entityId: EntityId) => EntityOverlayData | undefined;
}

const SAVING_STATE: EntityPersistenceState = { status: 'saving', error: null };

const createErrorState = (error: unknown): EntityPersistenceState => ({
  status: 'error',
  error,
});

export const useOverlayPersistence = ({
  adapter,
  dispatch,
  emitEvent,
  getEntityData,
}: UseOverlayPersistenceArgs) => {
  const adapterRef = useRef(adapter);
  const failedEventsRef = useRef<Map<EntityId, OverlayChangeEvent>>(new Map());
  const operationCounterRef = useRef(0);
  const latestOperationRef = useRef<Map<EntityId, number>>(new Map());

  useEffect(() => {
    adapterRef.current = adapter;
  }, [adapter]);

  const schedulePersistence = useCallback(
    (change: OverlayChangeEvent) => {
      if (change.kind === 'upsert' && !change.next) {
        return;
      }

      failedEventsRef.current.delete(change.entityId);
      const attemptId = operationCounterRef.current + 1;
      operationCounterRef.current = attemptId;
      latestOperationRef.current.set(change.entityId, attemptId);

      dispatch({ type: 'set-persistence', entityId: change.entityId, state: SAVING_STATE });
      emitEvent({ type: 'save-start', entityId: change.entityId });

      const adapterInstance = adapterRef.current;
      const persistence =
        change.kind === 'upsert' && change.next
          ? adapterInstance.saveEntity(change.next, change.previous)
          : adapterInstance.removeEntity(change.entityId, change.previous);

      Promise.resolve(persistence)
        .then(() => {
          if (latestOperationRef.current.get(change.entityId) !== attemptId) {
            return;
          }
          failedEventsRef.current.delete(change.entityId);
          dispatch({ type: 'set-persistence', entityId: change.entityId, state: null });
          emitEvent({
            type: 'save-success',
            entityId: change.entityId,
            data: change.kind === 'upsert' ? change.next : change.previous,
          });
        })
        .catch((error) => {
          if (latestOperationRef.current.get(change.entityId) !== attemptId) {
            return;
          }
          failedEventsRef.current.set(change.entityId, change);
          dispatch({ type: 'set-persistence', entityId: change.entityId, state: createErrorState(error) });

          if (change.kind === 'upsert') {
            dispatch({ type: 'replace-entity', entityId: change.entityId, data: change.previous });
          } else if (change.kind === 'remove' && change.previous) {
            dispatch({ type: 'replace-entity', entityId: change.entityId, data: change.previous });
          }

          emitEvent({ type: 'save-error', entityId: change.entityId, error, attempted: change });
        });
    },
    [dispatch, emitEvent],
  );

  const retryFailedPersistence = useCallback(
    (entityId: EntityId) => {
      const failed = failedEventsRef.current.get(entityId);
      if (!failed) {
        return;
      }
      const currentPrevious = getEntityData(entityId);
      const retryEvent: OverlayChangeEvent = {
        ...failed,
        previous: failed.kind === 'remove' ? failed.previous ?? currentPrevious : currentPrevious,
      };

      if (failed.kind === 'upsert' && failed.next) {
        dispatch({ type: 'replace-entity', entityId, data: failed.next });
      } else if (failed.kind === 'remove') {
        dispatch({ type: 'replace-entity', entityId });
      }

      emitEvent({
        type: 'change',
        changeType: failed.kind,
        entityId,
        next: retryEvent.next,
        previous: retryEvent.previous,
      });

      schedulePersistence(retryEvent);
    },
    [dispatch, emitEvent, getEntityData, schedulePersistence],
  );

  return {
    schedulePersistence,
    retryFailedPersistence,
  };
};
