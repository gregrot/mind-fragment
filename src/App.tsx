import { useCallback, useEffect, useMemo, useState } from 'react';
import SimulationShell from './simulation/SimulationShell';
import { useBlockWorkspace } from './hooks/useBlockWorkspace';
import SimulationOverlay, { type OverlayTab } from './components/SimulationOverlay';
import OnboardingFlow from './onboarding/OnboardingFlow';
import { useRobotSelection } from './hooks/useRobotSelection';
import { simulationRuntime } from './state/simulationRuntime';
import type { WorkspaceState } from './types/blocks';
import styles from './styles/App.module.css';

const DEFAULT_ROBOT_ID = 'MF-01';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const App = (): JSX.Element => {
  const { workspace, handleDrop, handleTouchDrop, replaceWorkspace, updateBlockInstance } = useBlockWorkspace();
  const { selectedRobotId, clearSelection } = useRobotSelection();
  const [isOverlayOpen, setOverlayOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<OverlayTab>('inventory');
  const [robotPrograms, setRobotPrograms] = useState<Record<string, WorkspaceState>>({});
  const [workspaceRobotId, setWorkspaceRobotId] = useState<string>(
    () => selectedRobotId ?? DEFAULT_ROBOT_ID,
  );
  const activeRobotId = useMemo(() => selectedRobotId ?? DEFAULT_ROBOT_ID, [selectedRobotId]);

  const openOverlay = useCallback((tab: OverlayTab) => {
    setActiveTab(tab);
    setOverlayOpen(true);
  }, []);

  const handleTabChange = useCallback(
    (tab: OverlayTab) => {
      if (tab === 'programming' && !selectedRobotId) {
        simulationRuntime.setSelectedRobot(DEFAULT_ROBOT_ID);
      }
      setActiveTab(tab);
    },
    [selectedRobotId],
  );

  const handleProgramRobot = useCallback(() => {
    simulationRuntime.setSelectedRobot(DEFAULT_ROBOT_ID);
    openOverlay('programming');
  }, [openOverlay]);

  const handleRobotSelect = useCallback(() => {
    openOverlay('programming');
  }, [openOverlay]);

  const handleOverlayClose = useCallback(() => {
    setOverlayOpen(false);
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    if (selectedRobotId) {
      setOverlayOpen(true);
      setActiveTab('programming');
    }
  }, [selectedRobotId]);

  useEffect(() => {
    if (workspaceRobotId === activeRobotId) {
      return;
    }

    const targetProgram = robotPrograms[activeRobotId];
    if (targetProgram) {
      if (workspace !== targetProgram) {
        replaceWorkspace(() => targetProgram);
      }
    } else if (workspace.length > 0) {
      replaceWorkspace(() => []);
    }

    setWorkspaceRobotId(activeRobotId);
  }, [activeRobotId, robotPrograms, replaceWorkspace, workspace, workspaceRobotId]);

  useEffect(() => {
    setRobotPrograms((current) => {
      const existing = current[workspaceRobotId];
      if (existing === workspace) {
        return current;
      }
      if (!existing && workspace.length === 0) {
        return current;
      }
      return {
        ...current,
        [workspaceRobotId]: workspace,
      };
    });
  }, [workspace, workspaceRobotId]);

  useEffect(() => {
    const isEditableElement = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      return EDITABLE_TAGS.has(target.tagName);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableElement(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'escape') {
        handleOverlayClose();
        return;
      }

      if (key === 'i') {
        if (isOverlayOpen && activeTab === 'inventory') {
          setOverlayOpen(false);
        } else {
          openOverlay('inventory');
        }
        return;
      }

      if (key === 'c') {
        if (isOverlayOpen && activeTab === 'catalog') {
          setOverlayOpen(false);
        } else {
          openOverlay('catalog');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab, handleOverlayClose, isOverlayOpen, openOverlay]);

  return (
    <div className={styles.appShell}>
      <SimulationShell onRobotSelect={handleRobotSelect} />
      <div className={styles.controlBar} role="toolbar" aria-label="Simulation interface controls">
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => openOverlay('inventory')}
          data-active={isOverlayOpen && activeTab === 'inventory'}
        >
          Inventory
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => openOverlay('catalog')}
          data-active={isOverlayOpen && activeTab === 'catalog'}
        >
          Catalogue
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
          onClick={handleProgramRobot}
          data-active={isOverlayOpen && activeTab === 'programming'}
          data-testid="select-robot"
        >
          Program robot
        </button>
      </div>
      <SimulationOverlay
        isOpen={isOverlayOpen}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onClose={handleOverlayClose}
        onConfirm={handleOverlayClose}
        workspace={workspace}
        onDrop={handleDrop}
        onTouchDrop={handleTouchDrop}
        onUpdateBlock={updateBlockInstance}
        robotId={activeRobotId}
      />
      <OnboardingFlow replaceWorkspace={replaceWorkspace} openProgrammingOverlay={handleProgramRobot} />
    </div>
  );
};

export default App;
