import { useCallback, type DragEvent } from 'react';
import BlockPalette from './BlockPalette';
import Workspace from './Workspace';
import RuntimeControls from './RuntimeControls';
import { BLOCK_LIBRARY } from '../blocks/library';
import type { WorkspaceState, DropTarget } from '../types/blocks';
import styles from '../styles/RobotProgrammingPanel.module.css';

interface RobotProgrammingPanelProps {
  workspace: WorkspaceState;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
  onClose: () => void;
  onConfirm: () => void;
  robotId: string;
}

const RobotProgrammingPanel = ({
  workspace,
  onDrop,
  onClose,
  onConfirm,
  robotId,
}: RobotProgrammingPanelProps): JSX.Element => {
  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  return (
    <div className={styles.programming}>
      <div className={styles.summary}>
        <p className={styles.kicker}>Selected robot</p>
        <h3 className={styles.title}>Chassis {robotId}</h3>
        <p className={styles.description}>
          Combine blocks from the palette and deploy updates to steer the prototype within the simulation.
        </p>
      </div>
      <div className={styles.layout} data-testid="programming-layout">
        <aside className={styles.palette}>
          <h4>Block palette</h4>
          <BlockPalette blocks={BLOCK_LIBRARY} />
        </aside>
        <section className={styles.workspace}>
          <h4>Workspace</h4>
          <Workspace blocks={workspace} onDrop={onDrop} />
        </section>
      </div>
      <footer className={styles.footer}>
        <RuntimeControls workspace={workspace} />
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} onClick={handleConfirm}>
            Deploy routine
          </button>
        </div>
      </footer>
    </div>
  );
};

export default RobotProgrammingPanel;
