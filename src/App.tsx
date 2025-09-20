import { useCallback, useMemo } from 'react';
import SimulationShell from './simulation/SimulationShell';
import ModuleInventory from './components/ModuleInventory';
import { useBlockWorkspace } from './hooks/useBlockWorkspace';
import InventoryStatus from './components/InventoryStatus';
import RobotProgrammingOverlay from './components/RobotProgrammingOverlay';
import { useRobotSelection } from './hooks/useRobotSelection';
import { simulationRuntime } from './state/simulationRuntime';
import styles from './styles/App.module.css';

const DEFAULT_ROBOT_ID = 'MF-01';

const App = (): JSX.Element => {
  const { workspace, handleDrop } = useBlockWorkspace();
  const { selectedRobotId, clearSelection } = useRobotSelection();

  const handleProgramRobot = useCallback(() => {
    simulationRuntime.setSelectedRobot(DEFAULT_ROBOT_ID);
  }, []);

  const handleOverlayClose = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const activeRobotId = useMemo(() => selectedRobotId ?? DEFAULT_ROBOT_ID, [selectedRobotId]);
  const isOverlayOpen = selectedRobotId !== null;

  return (
    <div className={styles.appShell}>
      <SimulationShell />
      <div className={styles.worldHud} role="region" aria-label="World interface HUD">
        <header className={styles.worldHudHeader}>
          <div>
            <p className={styles.worldHudKicker}>Mind Fragment Simulation</p>
            <h1 className={styles.worldHudTitle}>Field Prototype</h1>
            <p className={styles.worldHudSubtitle}>
              Monitor resources and open the block workspace to programme the selected chassis.
            </p>
          </div>
          <button
            type="button"
            className={styles.worldHudPrimary}
            onClick={handleProgramRobot}
            data-testid="select-robot"
          >
            Program robot
          </button>
        </header>
        <div className={styles.worldHudPanels}>
          <InventoryStatus />
          <ModuleInventory />
        </div>
      </div>
      {isOverlayOpen ? (
        <RobotProgrammingOverlay
          workspace={workspace}
          onDrop={handleDrop}
          onClose={handleOverlayClose}
          onConfirm={handleOverlayClose}
          robotId={activeRobotId}
        />
      ) : null}
    </div>
  );
};

export default App;
