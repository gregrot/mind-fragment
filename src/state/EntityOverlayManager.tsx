import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EntityId } from '../simulation/ecs/world';
import type { EntityOverlayData, InspectorTabId } from '../types/overlay';
import {
  getDefaultOverlayPersistenceAdapter,
  type OverlayPersistenceAdapter,
} from './overlayPersistence';

interface OpenOptions {
  initialTab?: InspectorTabId;
}

type OverlayChangeKind = 'upsert' | 'remove';

interface OverlayChangeEvent {
  kind: OverlayChangeKind;
  entityId: EntityId;
  next?: EntityOverlayData;
  previous?: EntityOverlayData;
}

export type EntityOverlayEvent =
  | {
      type: 'change';
      changeType: OverlayChangeKind;
      entityId: EntityId;
      next?: EntityOverlayData;
      previous?: EntityOverlayData;
    }
  | { type: 'save-start'; entityId: EntityId }
  | {
      type: 'save-success';
      entityId: EntityId;
      data?: EntityOverlayData;
    }
  | {
      type: 'save-error';
      entityId: EntityId;
      error: unknown;
      attempted: OverlayChangeEvent;
    };

export interface EntityPersistenceState {
  status: 'idle' | 'saving' | 'error';
  error: unknown | null;
}

interface EntityOverlayManagerContextValue {
  isOpen: boolean;
  selectedEntityId: EntityId | null;
  overlayType: EntityOverlayData['overlayType'] | null;
  activeTab: InspectorTabId;
  openOverlay: (data: EntityOverlayData, options?: OpenOptions) => void;
  closeOverlay: () => void;
  setActiveTab: (tab: InspectorTabId) => void;
  getEntityData: (entityId: EntityId) => EntityOverlayData | undefined;
  upsertEntityData: (data: EntityOverlayData, options?: { silent?: boolean }) => void;
  removeEntityData: (entityId: EntityId, options?: { silent?: boolean }) => void;
  subscribe: (listener: (event: EntityOverlayEvent) => void) => () => void;
  getPersistenceState: (entityId: EntityId) => EntityPersistenceState;
  retryPersistence: (entityId: EntityId) => void;
}

const DEFAULT_TAB: InspectorTabId = 'systems';
const IDLE_STATE: EntityPersistenceState = { status: 'idle', error: null };

const EntityOverlayManagerContext = createContext<EntityOverlayManagerContextValue | undefined>(
  undefined,
);

const getDefaultTabForOverlay = (data: EntityOverlayData): InspectorTabId => {
  if (data.overlayType === 'simple') {
    return 'info';
  }
  return DEFAULT_TAB;
};

export const EntityOverlayManagerProvider = ({
  children,
  persistenceAdapter,
}: {
  children: ReactNode;
  persistenceAdapter?: OverlayPersistenceAdapter;
}): JSX.Element => {
  const [entityDataMap, setEntityDataMap] = useState<Map<EntityId, EntityOverlayData>>(
    () => new Map(),
  );
  const [selectedEntityId, setSelectedEntityId] = useState<EntityId | null>(null);
  const [activeTab, setActiveTabState] = useState<InspectorTabId>(DEFAULT_TAB);
  const [persistenceStates, setPersistenceStates] = useState<Map<EntityId, EntityPersistenceState>>(
    () => new Map(),
  );
  const overlayTypeRef = useRef<EntityOverlayData['overlayType'] | null>(null);
  const listenersRef = useRef<Set<(event: EntityOverlayEvent) => void>>(new Set());
  const failedEventsRef = useRef<Map<EntityId, OverlayChangeEvent>>(new Map());
  const operationCounterRef = useRef(0);
  const latestOperationRef = useRef<Map<EntityId, number>>(new Map());

  const resolvedAdapter = useMemo(
    () => persistenceAdapter ?? getDefaultOverlayPersistenceAdapter(),
    [persistenceAdapter],
  );
  const adapterRef = useRef<OverlayPersistenceAdapter>(resolvedAdapter);

  useEffect(() => {
    adapterRef.current = resolvedAdapter;
  }, [resolvedAdapter]);

  const emitEvent = useCallback((event: EntityOverlayEvent) => {
    for (const listener of listenersRef.current) {
      listener(event);
    }
  }, []);

  const subscribe = useCallback((listener: (event: EntityOverlayEvent) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getEntityData = useCallback(
    (entityId: EntityId) => entityDataMap.get(entityId),
    [entityDataMap],
  );

  const setPersistenceForEntity = useCallback((entityId: EntityId, state: EntityPersistenceState) => {
    setPersistenceStates((current) => {
      const previous = current.get(entityId);
      if (previous?.status === state.status && previous?.error === state.error) {
        return current;
      }
      const next = new Map(current);
      if (state.status === 'idle' && state.error == null) {
        next.delete(entityId);
      } else {
        next.set(entityId, state);
      }
      return next;
    });
  }, []);

  const getPersistenceState = useCallback(
    (entityId: EntityId) => persistenceStates.get(entityId) ?? IDLE_STATE,
    [persistenceStates],
  );

  const schedulePersistence = useCallback(
    (change: OverlayChangeEvent) => {
      if (change.kind === 'upsert' && !change.next) {
        return;
      }
      const adapter = adapterRef.current;
      if (!adapter) {
        return;
      }

      failedEventsRef.current.delete(change.entityId);
      const attemptId = operationCounterRef.current + 1;
      operationCounterRef.current = attemptId;
      latestOperationRef.current.set(change.entityId, attemptId);

      setPersistenceForEntity(change.entityId, { status: 'saving', error: null });
      emitEvent({ type: 'save-start', entityId: change.entityId });

      const persistence =
        change.kind === 'upsert' && change.next
          ? adapter.saveEntity(change.next, change.previous)
          : adapter.removeEntity(change.entityId, change.previous);

      Promise.resolve(persistence)
        .then(() => {
          if (latestOperationRef.current.get(change.entityId) !== attemptId) {
            return;
          }
          failedEventsRef.current.delete(change.entityId);
          setPersistenceForEntity(change.entityId, { status: 'idle', error: null });
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
          setPersistenceForEntity(change.entityId, { status: 'error', error });

          if (change.kind === 'upsert') {
            setEntityDataMap((current) => {
              const next = new Map(current);
              if (change.previous) {
                next.set(change.entityId, change.previous);
              } else {
                next.delete(change.entityId);
              }
              return next;
            });
          } else if (change.kind === 'remove' && change.previous) {
            setEntityDataMap((current) => {
              const next = new Map(current);
              next.set(change.entityId, change.previous!);
              return next;
            });
          }

          emitEvent({ type: 'save-error', entityId: change.entityId, error, attempted: change });
        });
    },
    [emitEvent, setPersistenceForEntity],
  );

  const upsertEntityData = useCallback(
    (data: EntityOverlayData, options?: { silent?: boolean }) => {
      let previous: EntityOverlayData | undefined;
      let changed = false;
      setEntityDataMap((current) => {
        previous = current.get(data.entityId);
        if (previous === data) {
          return current;
        }
        const next = new Map(current);
        next.set(data.entityId, data);
        changed = true;
        return next;
      });
      if (!changed) {
        return;
      }
      const changeEvent: OverlayChangeEvent = {
        kind: 'upsert',
        entityId: data.entityId,
        next: data,
        previous,
      };
      if (!options?.silent) {
        emitEvent({
          type: 'change',
          changeType: 'upsert',
          entityId: data.entityId,
          next: data,
          previous,
        });
        schedulePersistence(changeEvent);
      }
    },
    [emitEvent, schedulePersistence],
  );

  const removeEntityData = useCallback(
    (entityId: EntityId, options?: { silent?: boolean }) => {
      let previous: EntityOverlayData | undefined;
      let removed = false;
      setEntityDataMap((current) => {
        if (!current.has(entityId)) {
          return current;
        }
        previous = current.get(entityId);
        const next = new Map(current);
        next.delete(entityId);
        removed = true;
        return next;
      });
      if (!removed) {
        return;
      }
      const changeEvent: OverlayChangeEvent = {
        kind: 'remove',
        entityId,
        previous,
      };
      if (!options?.silent) {
        emitEvent({
          type: 'change',
          changeType: 'remove',
          entityId,
          previous,
        });
        schedulePersistence(changeEvent);
      }
    },
    [emitEvent, schedulePersistence],
  );

  const retryPersistence = useCallback(
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
        setEntityDataMap((current) => {
          const next = new Map(current);
          next.set(entityId, failed.next!);
          return next;
        });
      } else if (failed.kind === 'remove') {
        setEntityDataMap((current) => {
          if (!current.has(entityId)) {
            return current;
          }
          const next = new Map(current);
          next.delete(entityId);
          return next;
        });
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
    [emitEvent, getEntityData, schedulePersistence],
  );

  const openOverlay = useCallback(
    (data: EntityOverlayData, options?: OpenOptions) => {
      upsertEntityData(data, { silent: true });
      overlayTypeRef.current = data.overlayType;
      setSelectedEntityId(data.entityId);
      setActiveTabState(options?.initialTab ?? getDefaultTabForOverlay(data));
    },
    [upsertEntityData],
  );

  const closeOverlay = useCallback(() => {
    setSelectedEntityId(null);
    overlayTypeRef.current = null;
  }, []);

  const setActiveTab = useCallback((tab: InspectorTabId) => {
    setActiveTabState(tab);
  }, []);

  const value = useMemo<EntityOverlayManagerContextValue>(
    () => ({
      isOpen: selectedEntityId !== null,
      selectedEntityId,
      overlayType: overlayTypeRef.current,
      activeTab,
      openOverlay,
      closeOverlay,
      setActiveTab,
      getEntityData,
      upsertEntityData,
      removeEntityData,
      subscribe,
      getPersistenceState,
      retryPersistence,
    }),
    [
      activeTab,
      closeOverlay,
      getEntityData,
      getPersistenceState,
      openOverlay,
      removeEntityData,
      retryPersistence,
      selectedEntityId,
      setActiveTab,
      subscribe,
      upsertEntityData,
    ],
  );

  return (
    <EntityOverlayManagerContext.Provider value={value}>
      {children}
    </EntityOverlayManagerContext.Provider>
  );
};

export const useEntityOverlayManager = (): EntityOverlayManagerContextValue => {
  const context = useContext(EntityOverlayManagerContext);
  if (!context) {
    throw new Error('useEntityOverlayManager must be used within an EntityOverlayManagerProvider');
  }
  return context;
};
