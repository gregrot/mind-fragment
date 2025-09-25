import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEntityOverlayManager } from '../state/EntityOverlayManager';
import type { EntityPersistenceState } from '../state/EntityOverlayManager';
import { getInspectorsForEntity } from '../overlay/inspectorRegistry';
import type { InspectorDefinition } from '../overlay/inspectorRegistry';
import type { InspectorTabId } from '../types/overlay';
import styles from '../styles/SimulationOverlay.module.css';
import DragPreviewLayer from './DragPreviewLayer';
import SkeletonBlock from './SkeletonBlock';

const TAB_LABELS: Record<InspectorTabId, string> = {
  systems: 'Systems',
  programming: 'Programming',
  info: 'Info',
};

const TAB_ORDER: InspectorTabId[] = ['systems', 'programming', 'info'];

const DEFAULT_PERSISTENCE_STATE: EntityPersistenceState = { status: 'idle', error: null };

interface EntityOverlayProps {
  onClose: () => void;
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const EntityOverlay = ({ onClose }: EntityOverlayProps): JSX.Element | null => {
  const {
    isOpen,
    selectedEntityId,
    activeTab,
    setActiveTab,
    getEntityData,
    getPersistenceState,
  } = useEntityOverlayManager();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const entity = useMemo(() => {
    if (selectedEntityId === null) {
      return undefined;
    }
    return getEntityData(selectedEntityId);
  }, [getEntityData, selectedEntityId]);

  const inspectors = useMemo<InspectorDefinition[]>(() => {
    if (!entity) {
      return [];
    }
    return getInspectorsForEntity(entity);
  }, [entity]);

  const groupedInspectors = useMemo(() => {
    const groups = new Map<InspectorTabId, InspectorDefinition[]>();
    for (const inspector of inspectors) {
      const current = groups.get(inspector.group) ?? [];
      current.push(inspector);
      groups.set(inspector.group, current);
    }
    return groups;
  }, [inspectors]);

  const persistenceState =
    selectedEntityId !== null ? getPersistenceState(selectedEntityId) : DEFAULT_PERSISTENCE_STATE;
  const isLoading = !entity || persistenceState.status === 'saving';
  const hasError = persistenceState.status === 'error';
  const errorMessage =
    hasError && persistenceState.error instanceof Error
      ? persistenceState.error.message
      : hasError
      ? 'Saving changes failed. Try again.'
      : null;
  const titleText = entity?.name ?? 'Loading entity…';
  const descriptionText = entity?.description ?? 'Configure chassis systems, inventory, and behaviour.';
  const accessibleTitle = isLoading ? 'Loading entity…' : titleText;
  const accessibleDescription = isLoading ? 'Preparing inspector controls.' : descriptionText;

  const availableTabs = useMemo<InspectorTabId[]>(() => {
    if (!entity) {
      return [];
    }
    if (entity.overlayType === 'simple') {
      return ['info'];
    }
    return ['systems', 'programming', 'info'];
  }, [entity]);

  useEffect(() => {
    if (!isOpen || availableTabs.length === 0) {
      return;
    }
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]!);
    }
  }, [activeTab, availableTabs, isOpen, setActiveTab]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    if (typeof document === 'undefined') {
      return undefined;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen, onClose]);

  const handleTabSelect = useCallback(
    (tab: InspectorTabId) => {
      setActiveTab(tab);
    },
    [setActiveTab],
  );

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, tab: InspectorTabId) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        if (availableTabs.length === 0) {
          return;
        }
        const direction = event.key === 'ArrowLeft' ? -1 : 1;
        const currentIndex = availableTabs.indexOf(tab);
        const nextIndex = (currentIndex + direction + availableTabs.length) % availableTabs.length;
        setActiveTab(availableTabs[nextIndex]!);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        setActiveTab(availableTabs[0]!);
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        setActiveTab(availableTabs[availableTabs.length - 1]!);
      }
    },
    [availableTabs, setActiveTab],
  );

  const focusFirstInteractive = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof document === 'undefined') {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      if (dialog.contains(activeElement) && activeElement !== dialog) {
        return;
      }
    }

    const activeTabElement = dialog.querySelector<HTMLElement>(
      `#simulation-overlay-tab-${activeTab}`,
    );
    if (activeTabElement) {
      activeTabElement.focus({ preventScroll: true });
      return;
    }

    const focusable = dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.focus({ preventScroll: true });
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      focusFirstInteractive();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusFirstInteractive, isOpen]);

  if (!isOpen) {
    return null;
  }

  const renderInspectors = (tab: InspectorTabId) => {
    if (!entity) {
      return null;
    }
    const definitions = groupedInspectors.get(tab) ?? [];
    if (definitions.length === 0) {
      if (tab === 'systems') {
        return <p className={styles.placeholder}>Systems management is coming soon.</p>;
      }
      if (tab === 'info') {
        return (
          <div className={styles.placeholderGroup}>
            <h3 className={styles.placeholderTitle}>{entity.name}</h3>
            {entity.description ? (
              <p className={styles.placeholderDescription}>{entity.description}</p>
            ) : null}
          </div>
        );
      }
      return <p className={styles.placeholder}>No inspector available for this tab.</p>;
    }
    return (
      <Fragment>
        {definitions.map((definition) => {
          const Component = definition.component;
          return (
            <Component
              key={definition.id}
              entity={entity}
              onClose={onClose}
              isLoading={isLoading}
              persistenceState={persistenceState}
            />
          );
        })}
      </Fragment>
    );
  };

  const renderedTabs = TAB_ORDER.filter((tab) => availableTabs.includes(tab));

  return (
    <div className={styles.overlay} data-testid="entity-overlay">
      <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-overlay-title"
        aria-describedby="entity-overlay-description"
        aria-busy={isLoading ? 'true' : undefined}
        data-loading={isLoading ? 'true' : undefined}
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className={styles.header} data-loading={isLoading ? 'true' : undefined}>
          <div className={styles.headerContent} aria-live="polite">
            <p className={styles.kicker}>Mind Fragment Console</p>
            <h2 id="entity-overlay-title" className={styles.title} data-loading={isLoading ? 'true' : undefined}>
              <span className={isLoading ? styles.srOnly : undefined}>{accessibleTitle}</span>
              {isLoading ? <SkeletonBlock className={styles.titleSkeleton} height={32} /> : null}
            </h2>
            <p
              id="entity-overlay-description"
              className={styles.description}
              data-loading={isLoading ? 'true' : undefined}
            >
              <span className={isLoading ? styles.srOnly : undefined}>{accessibleDescription}</span>
              {isLoading ? (
                <>
                  <SkeletonBlock className={styles.descriptionSkeleton} height={18} />
                  <SkeletonBlock className={styles.descriptionSkeleton} height={18} width="70%" />
                </>
              ) : null}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </header>
        {hasError ? (
          <div className={styles.errorBanner} role="alert">
            <strong className={styles.errorTitle}>Changes not saved</strong>
            <p className={styles.errorMessage}>{errorMessage ?? 'Something went wrong while saving.'}</p>
          </div>
        ) : null}
        <nav
          className={styles.tabList}
          role={renderedTabs.length > 0 ? 'tablist' : undefined}
          aria-label="Entity inspectors"
          aria-busy={isLoading ? 'true' : undefined}
        >
          {entity ? (
            renderedTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`simulation-overlay-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={activeTab === tab ? `simulation-overlay-panel-${tab}` : undefined}
                tabIndex={activeTab === tab ? 0 : -1}
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`.trim()}
                data-variant={tab}
                onClick={() => handleTabSelect(tab)}
                onKeyDown={(event) => handleTabKeyDown(event, tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))
          ) : (
            <div className={styles.tabSkeletonList} aria-hidden="true">
              <SkeletonBlock className={styles.tabSkeleton} height={36} width="32%" />
              <SkeletonBlock className={styles.tabSkeleton} height={36} width="28%" />
              <SkeletonBlock className={styles.tabSkeleton} height={36} width="24%" />
            </div>
          )}
        </nav>
        <div className={styles.content}>
          {entity ? (
            renderedTabs.map((tab) => {
              const isActive = activeTab === tab;
              const panelClass =
                tab === 'programming'
                  ? `${styles.panel} ${styles.panelProgramming}`.trim()
                  : styles.panel;
              return (
                <div
                  key={tab}
                  id={`simulation-overlay-panel-${tab}`}
                  role="tabpanel"
                  aria-labelledby={`simulation-overlay-tab-${tab}`}
                  hidden={!isActive}
                  aria-hidden={!isActive}
                  style={{ display: isActive ? undefined : 'none' }}
                  className={panelClass}
                  data-loading={isLoading ? 'true' : undefined}
                >
                  {renderInspectors(tab)}
                </div>
              );
            })
          ) : (
            <div className={styles.panelSkeletonGroup} aria-hidden="true">
              <div className={styles.panelSkeletonHeader}>
                <SkeletonBlock height={22} width="40%" />
                <SkeletonBlock height={16} width="65%" />
              </div>
              <div className={styles.panelSkeletonGrid}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonBlock key={index} className={styles.panelSkeletonTile} height={112} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <DragPreviewLayer />
    </div>
  );
};

export default EntityOverlay;
