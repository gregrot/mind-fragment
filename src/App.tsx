import SimulationShell from './simulation/SimulationShell';
import ModuleInventory from './components/ModuleInventory';
import { useBlockWorkspace } from './hooks/useBlockWorkspace';
import InventoryStatus from './components/InventoryStatus';
import RobotProgrammingOverlay from './components/RobotProgrammingOverlay';
import {
  RobotProgrammingOverlayProvider,
  useRobotProgrammingOverlay,
} from './state/RobotProgrammingOverlayContext';

const DEFAULT_ROBOT_ID = 'MF-01';

const AppContent = (): JSX.Element => {
  const { workspace, handleDrop } = useBlockWorkspace();
  const { isOpen, selectedRobotId, openOverlay, closeOverlay } = useRobotProgrammingOverlay();

  const handleProgramRobot = () => {
    openOverlay(DEFAULT_ROBOT_ID);
  };

  const handleOverlayClose = () => {
    closeOverlay();
  };

  const activeRobotId = selectedRobotId ?? DEFAULT_ROBOT_ID;

  return (
    <div className="app-shell">
      <SimulationShell onRobotSelect={handleProgramRobot} />
      <div className="world-hud" role="region" aria-label="World interface HUD">
        <header className="world-hud-header">
          <div>
            <p className="world-hud-kicker">Mind Fragment Simulation</p>
            <h1>Field Prototype</h1>
            <p className="world-hud-subtitle">
              Monitor resources and open the block workspace to programme the selected chassis.
            </p>
          </div>
          <button
            type="button"
            className="world-hud-primary"
            onClick={handleProgramRobot}
            data-testid="select-robot"
          >
            Program robot
          </button>
        </header>
        <div className="world-hud-panels">
          <InventoryStatus />
          <ModuleInventory />
        </div>
      </div>
      {isOpen ? (
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

function App(): JSX.Element {
  return (
    <RobotProgrammingOverlayProvider>
      <AppContent />
    </RobotProgrammingOverlayProvider>
  );
}

export default App;
