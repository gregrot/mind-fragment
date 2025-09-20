import { useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react';
import InventoryStatus from './InventoryStatus';
import ModuleInventory from './ModuleInventory';
import RobotProgrammingPanel from './RobotProgrammingPanel';
import type { WorkspaceState, DropTarget } from '../types/blocks';
import styles from '../styles/SimulationOverlay.module.css';

export type OverlayTab = 'inventory' | 'catalog' | 'programming';

const TAB_LABELS: Record<OverlayTab, string> = {
  inventory: 'Inventory',
  catalog: 'Catalogue',
  programming: 'Programming',
};

const TAB_ORDER: OverlayTab[] = ['inventory', 'catalog', 'programming'];

interface SimulationOverlayProps {
  isOpen: boolean;
  activeTab: OverlayTab;
  onTabChange: (tab: OverlayTab) => void;
  onClose: () => void;
  onConfirm: () => void;
  workspace: WorkspaceState;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
  robotId: string;
}

const SimulationOverlay = ({
  isOpen,
  activeTab,
  onTabChange,
  onClose,
  onConfirm,
  workspace,
  onDrop,
  robotId,
}: SimulationOverlayProps): JSX.Element | null => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

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

  const description = useMemo(() => {
    switch (activeTab) {
      case 'inventory':
        return 'Monitor stored resources and capacity for the active expedition.';
      case 'catalog':
        return 'Review module schematics and programmable hooks available in this build.';
      case 'programming':
      default:
        return `Build or refine a block routine for chassis ${robotId}.`;
    }
  }, [activeTab, robotId]);

  const handleTabClick = useCallback(
    (tab: OverlayTab) => () => {
      onTabChange(tab);
    },
    [onTabChange],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay} data-testid="robot-programming-overlay">
      <div className={styles.backdrop} aria-hidden="true" />
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulation-overlay-title"
        aria-describedby="simulation-overlay-description"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Mind Fragment Console</p>
            <h2 id="simulation-overlay-title" className={styles.title}>
              Operations Overlay
            </h2>
            <p id="simulation-overlay-description" className={styles.description}>
              {description}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </header>
        <nav className={styles.tabList} role="tablist" aria-label="Simulation panels">
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`simulation-overlay-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={`simulation-overlay-panel-${tab}`}
              tabIndex={activeTab === tab ? 0 : -1}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`.trim()}
              data-variant={tab}
              onClick={handleTabClick(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>
        <div className={styles.content}>
          <div
            id="simulation-overlay-panel-inventory"
            role="tabpanel"
            aria-labelledby="simulation-overlay-tab-inventory"
            hidden={activeTab !== 'inventory'}
            className={styles.panel}
          >
            <InventoryStatus />
          </div>
          <div
            id="simulation-overlay-panel-catalog"
            role="tabpanel"
            aria-labelledby="simulation-overlay-tab-catalog"
            hidden={activeTab !== 'catalog'}
            className={styles.panel}
          >
            <ModuleInventory />
          </div>
          <div
            id="simulation-overlay-panel-programming"
            role="tabpanel"
            aria-labelledby="simulation-overlay-tab-programming"
            hidden={activeTab !== 'programming'}
            className={`${styles.panel} ${styles.panelProgramming}`}
          >
            <RobotProgrammingPanel
              workspace={workspace}
              onDrop={onDrop}
              onClose={onClose}
              onConfirm={onConfirm}
              robotId={robotId}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationOverlay;
