import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EntityId } from '../simulation/ecs/world';
import type { EntityOverlayData, InspectorTabId } from '../types/overlay';

interface OpenOptions {
  initialTab?: InspectorTabId;
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
  upsertEntityData: (data: EntityOverlayData) => void;
  removeEntityData: (entityId: EntityId) => void;
}

const DEFAULT_TAB: InspectorTabId = 'systems';

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
}: {
  children: ReactNode;
}): JSX.Element => {
  const [entityDataMap, setEntityDataMap] = useState<Map<EntityId, EntityOverlayData>>(
    () => new Map(),
  );
  const [selectedEntityId, setSelectedEntityId] = useState<EntityId | null>(null);
  const [activeTab, setActiveTabState] = useState<InspectorTabId>(DEFAULT_TAB);
  const overlayTypeRef = useRef<EntityOverlayData['overlayType'] | null>(null);

  const getEntityData = useCallback(
    (entityId: EntityId) => entityDataMap.get(entityId),
    [entityDataMap],
  );

  const upsertEntityData = useCallback((data: EntityOverlayData) => {
    setEntityDataMap((current) => {
      const next = new Map(current);
      next.set(data.entityId, data);
      return next;
    });
  }, []);

  const removeEntityData = useCallback((entityId: EntityId) => {
    setEntityDataMap((current) => {
      if (!current.has(entityId)) {
        return current;
      }
      const next = new Map(current);
      next.delete(entityId);
      return next;
    });
  }, []);

  const openOverlay = useCallback(
    (data: EntityOverlayData, options?: OpenOptions) => {
      upsertEntityData(data);
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
    }),
    [activeTab, closeOverlay, getEntityData, openOverlay, removeEntityData, selectedEntityId, setActiveTab, upsertEntityData],
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
