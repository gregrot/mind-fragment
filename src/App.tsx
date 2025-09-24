import { useCallback, useEffect, useMemo, useState } from 'react';
import SimulationShell from './simulation/SimulationShell';
import { useBlockWorkspace } from './hooks/useBlockWorkspace';
import OnboardingFlow from './onboarding/OnboardingFlow';
import { useRobotSelection } from './hooks/useRobotSelection';
import { simulationRuntime } from './state/simulationRuntime';
import {
  EntityOverlayManagerProvider,
  useEntityOverlayManager,
} from './state/EntityOverlayManager';
import { ProgrammingInspectorProvider } from './state/ProgrammingInspectorContext';
import EntityOverlay from './components/EntityOverlay';
import { ensureDefaultInspectorsRegistered } from './overlay/defaultInspectors';
import type { WorkspaceState } from './types/blocks';
import type { EntityOverlayData } from './types/overlay';
import type { EntityId } from './simulation/ecs/world';
import styles from './styles/App.module.css';

const DEFAULT_ROBOT_ID = 'MF-01';
const ONBOARDING_ENABLED = false;

ensureDefaultInspectorsRegistered();

const buildRobotOverlayData = (robotId: string, entityId: EntityId): EntityOverlayData => ({
  entityId,
  name: `Robot ${robotId}`,
  description: `Configure systems and programming for chassis ${robotId}.`,
  overlayType: 'complex',
});

const AppContent = (): JSX.Element => {
  const {
    workspace,
    handleDrop,
    handleTouchDrop,
    replaceWorkspace,
    updateBlockInstance,
    removeBlockInstance,
  } = useBlockWorkspace();
  const { selectedRobotId, selectedEntityId, clearSelection } = useRobotSelection();
  const {
    isOpen,
    activeTab,
    openOverlay,
    closeOverlay,
    selectedEntityId: overlayEntityId,
  } = useEntityOverlayManager();
  const [robotPrograms, setRobotPrograms] = useState<Record<string, WorkspaceState>>({});
  const [workspaceRobotId, setWorkspaceRobotId] = useState<string>(
    () => selectedRobotId ?? DEFAULT_ROBOT_ID,
  );

  const activeRobotId = useMemo(() => selectedRobotId ?? DEFAULT_ROBOT_ID, [selectedRobotId]);

  const resolveEntityId = useCallback(
    (entityId: EntityId | null): EntityId => {
      if (entityId !== null && entityId !== undefined) {
        return entityId;
      }
      if (overlayEntityId !== null) {
        return overlayEntityId;
      }
      return 0 as EntityId;
    },
    [overlayEntityId],
  );

  const openOverlayForRobot = useCallback(
    (robotId: string, entityId: EntityId | null, initialTab?: 'systems' | 'programming' | 'info') => {
      const resolvedEntity = resolveEntityId(entityId);
      openOverlay(buildRobotOverlayData(robotId, resolvedEntity), { initialTab });
    },
    [openOverlay, resolveEntityId],
  );

  const handleEntitySelect = useCallback(
    ({ robotId, entityId }: { robotId: string; entityId: EntityId }) => {
      openOverlayForRobot(robotId, entityId, 'systems');
    },
    [openOverlayForRobot],
  );

  const handleEntityClear = useCallback(() => {
    closeOverlay();
  }, [closeOverlay]);

  const handleProgramRobot = useCallback(() => {
    const robotId = selectedRobotId ?? DEFAULT_ROBOT_ID;
    const resolvedEntity = resolveEntityId(selectedEntityId ?? overlayEntityId ?? null);
    simulationRuntime.setSelectedRobot(robotId, resolvedEntity);
    openOverlayForRobot(robotId, resolvedEntity, 'programming');
  }, [openOverlayForRobot, overlayEntityId, resolveEntityId, selectedEntityId, selectedRobotId]);

  const handleTabShortcut = useCallback(
    (tab: 'systems' | 'info' | 'programming') => {
      const robotId = selectedRobotId ?? DEFAULT_ROBOT_ID;
      const resolvedEntity = resolveEntityId(selectedEntityId ?? overlayEntityId ?? null);
      simulationRuntime.setSelectedRobot(robotId, resolvedEntity);
      openOverlayForRobot(robotId, resolvedEntity, tab);
    },
    [openOverlayForRobot, overlayEntityId, resolveEntityId, selectedEntityId, selectedRobotId],
  );

  const handleOverlayClose = useCallback(() => {
    closeOverlay();
    clearSelection();
  }, [clearSelection, closeOverlay]);

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

      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
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

      if (key === 's') {
        handleTabShortcut('systems');
        return;
      }

      if (key === 'i') {
        handleTabShortcut('info');
        return;
      }

      if (key === 'p') {
        handleProgramRobot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleProgramRobot, handleTabShortcut]);

  const programmingContextValue = useMemo(
    () => ({
      workspace,
      onDrop: handleDrop,
      onTouchDrop: handleTouchDrop,
      onUpdateBlock: updateBlockInstance,
      onRemoveBlock: removeBlockInstance,
      robotId: activeRobotId,
    }),
    [activeRobotId, handleDrop, handleTouchDrop, removeBlockInstance, updateBlockInstance, workspace],
  );

  return (
    <div className={styles.appShell}>
      <SimulationShell onEntitySelect={handleEntitySelect} onEntityClear={handleEntityClear} />
      <div className={styles.controlBar} role="toolbar" aria-label="Simulation interface controls">
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => handleTabShortcut('systems')}
          data-active={isOpen && activeTab === 'systems'}
        >
          Systems
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => handleTabShortcut('info')}
          data-active={isOpen && activeTab === 'info'}
        >
          Info
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
          onClick={handleProgramRobot}
          data-active={isOpen && activeTab === 'programming'}
          data-testid="select-robot"
        >
          Program robot
        </button>
      </div>
      <ProgrammingInspectorProvider value={programmingContextValue}>
        <EntityOverlay onClose={handleOverlayClose} />
      </ProgrammingInspectorProvider>
      {ONBOARDING_ENABLED ? (
        <OnboardingFlow
          replaceWorkspace={replaceWorkspace}
          openProgrammingOverlay={handleProgramRobot}
        />
      ) : null}
    </div>
  );
};

const App = (): JSX.Element => {
  return (
    <EntityOverlayManagerProvider>
      <AppContent />
    </EntityOverlayManagerProvider>
  );
};

export default App;
