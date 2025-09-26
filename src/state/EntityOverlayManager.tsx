import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
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
import { useOverlayPersistence } from './useOverlayPersistence';

interface OpenOptions {
  initialTab?: InspectorTabId;
}

export type OverlayChangeKind = 'upsert' | 'remove';

export interface OverlayChangeEvent {
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

interface OverlayManagerState {
  entities: Map<EntityId, EntityOverlayData>;
  persistence: Map<EntityId, EntityPersistenceState>;
}

export type EntityOverlayAction =
  | { type: 'replace-entity'; entityId: EntityId; data?: EntityOverlayData }
  | { type: 'set-persistence'; entityId: EntityId; state: EntityPersistenceState | null };

const createInitialOverlayState = (): OverlayManagerState => ({
  entities: new Map(),
  persistence: new Map(),
});

const overlayReducer = (
  state: OverlayManagerState,
  action: EntityOverlayAction,
): OverlayManagerState => {
  switch (action.type) {
    case 'replace-entity': {
      const current = state.entities.get(action.entityId);
      const hasEntity = state.entities.has(action.entityId);
      if (action.data) {
        if (current === action.data) {
          return state;
        }
        const nextEntities = new Map(state.entities);
        nextEntities.set(action.entityId, action.data);
        return { ...state, entities: nextEntities };
      }
      if (!hasEntity) {
        return state;
      }
      const nextEntities = new Map(state.entities);
      nextEntities.delete(action.entityId);
      return { ...state, entities: nextEntities };
    }
    case 'set-persistence': {
      if (!action.state) {
        if (!state.persistence.has(action.entityId)) {
          return state;
        }
        const nextPersistence = new Map(state.persistence);
        nextPersistence.delete(action.entityId);
        return { ...state, persistence: nextPersistence };
      }
      const current = state.persistence.get(action.entityId);
      if (current?.status === action.state.status && current?.error === action.state.error) {
        return state;
      }
      const nextPersistence = new Map(state.persistence);
      nextPersistence.set(action.entityId, action.state);
      return { ...state, persistence: nextPersistence };
    }
    default:
      return state;
  }
};

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

declare global {
  interface Window {
    __mfEntityOverlayManager?: EntityOverlayManagerContextValue;
  }
}

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
  const [overlayState, dispatch] = useReducer(overlayReducer, undefined, createInitialOverlayState);
  const [selectedEntityId, setSelectedEntityId] = useState<EntityId | null>(null);
  const [activeTab, setActiveTabState] = useState<InspectorTabId>(DEFAULT_TAB);
  const overlayTypeRef = useRef<EntityOverlayData['overlayType'] | null>(null);
  const listenersRef = useRef<Set<(event: EntityOverlayEvent) => void>>(new Set());

  const resolvedAdapter = useMemo(
    () => persistenceAdapter ?? getDefaultOverlayPersistenceAdapter(),
    [persistenceAdapter],
  );

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
    (entityId: EntityId) => overlayState.entities.get(entityId),
    [overlayState.entities],
  );

  const getPersistenceState = useCallback(
    (entityId: EntityId) => overlayState.persistence.get(entityId) ?? IDLE_STATE,
    [overlayState.persistence],
  );

  const { schedulePersistence, retryFailedPersistence } = useOverlayPersistence({
    adapter: resolvedAdapter,
    dispatch,
    emitEvent,
    getEntityData,
  });

  const upsertEntityData = useCallback(
    (data: EntityOverlayData, options?: { silent?: boolean }) => {
      const previous = overlayState.entities.get(data.entityId);
      if (previous === data) {
        return;
      }
      dispatch({ type: 'replace-entity', entityId: data.entityId, data });
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
    [dispatch, emitEvent, overlayState.entities, schedulePersistence],
  );

  const removeEntityData = useCallback(
    (entityId: EntityId, options?: { silent?: boolean }) => {
      if (!overlayState.entities.has(entityId)) {
        return;
      }
      const previous = overlayState.entities.get(entityId);
      dispatch({ type: 'replace-entity', entityId });
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
    [dispatch, emitEvent, overlayState.entities, schedulePersistence],
  );

  const retryPersistence = useCallback(
    (entityId: EntityId) => {
      retryFailedPersistence(entityId);
    },
    [retryFailedPersistence],
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

  useEffect(() => {
    window.__mfEntityOverlayManager = value;
    return () => {
      delete window.__mfEntityOverlayManager;
    };
  }, [value]);

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
