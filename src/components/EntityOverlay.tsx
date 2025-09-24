import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEntityOverlayManager } from '../state/EntityOverlayManager';
import { getInspectorsForEntity } from '../overlay/inspectorRegistry';
import type { InspectorDefinition } from '../overlay/inspectorRegistry';
import type { InspectorTabId } from '../types/overlay';
import styles from '../styles/SimulationOverlay.module.css';

const TAB_LABELS: Record<InspectorTabId, string> = {
  systems: 'Systems',
  programming: 'Programming',
  info: 'Info',
};

const TAB_ORDER: InspectorTabId[] = ['systems', 'programming', 'info'];

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

  if (!entity) {
    return (
      <div className={styles.overlay} data-testid="entity-overlay">
        <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
        <div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="entity-overlay-title"
          ref={dialogRef}
          tabIndex={-1}
        >
          <header className={styles.header}>
            <div>
              <p className={styles.kicker}>Mind Fragment Console</p>
              <h2 id="entity-overlay-title" className={styles.title}>
                Loading entity…
              </h2>
              <p className={styles.description}>
                Preparing inspector controls.
              </p>
            </div>
            <button type="button" className={styles.close} onClick={onClose}>
              Close
            </button>
          </header>
        </div>
      </div>
    );
  }

  const renderInspectors = (tab: InspectorTabId) => {
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
          return <Component key={definition.id} entity={entity} onClose={onClose} />;
        })}
      </Fragment>
    );
  };

  return (
    <div className={styles.overlay} data-testid="entity-overlay">
      <div className={styles.backdrop} aria-hidden="true" onClick={onClose} />
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-overlay-title"
        aria-describedby="entity-overlay-description"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Mind Fragment Console</p>
            <h2 id="entity-overlay-title" className={styles.title}>
              {entity.name}
            </h2>
            <p id="entity-overlay-description" className={styles.description}>
              {entity.description ?? 'Configure chassis systems, inventory, and behaviour.'}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </header>
        <nav className={styles.tabList} role="tablist" aria-label="Entity inspectors">
          {TAB_ORDER.filter((tab) => availableTabs.includes(tab)).map((tab) => (
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
          ))}
        </nav>
        <div className={styles.content}>
          {TAB_ORDER.filter((tab) => availableTabs.includes(tab)).map((tab) => (
            <div
              key={tab}
              id={`simulation-overlay-panel-${tab}`}
              role="tabpanel"
              aria-labelledby={`simulation-overlay-tab-${tab}`}
              hidden={activeTab !== tab}
              aria-hidden={activeTab !== tab}
              style={{ display: activeTab === tab ? undefined : 'none' }}
              className={styles.panel}
            >
              {renderInspectors(tab)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EntityOverlay;
