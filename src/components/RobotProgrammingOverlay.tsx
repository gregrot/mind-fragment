import { useCallback, useEffect, useRef, type DragEvent } from 'react';
import BlockPalette from './BlockPalette';
import Workspace from './Workspace';
import RuntimeControls from './RuntimeControls';
import { BLOCK_LIBRARY } from '../blocks/library';
import type { WorkspaceState, DropTarget } from '../types/blocks';
import styles from '../styles/RobotProgrammingOverlay.module.css';

interface RobotProgrammingOverlayProps {
  workspace: WorkspaceState;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
  onClose: () => void;
  onConfirm: () => void;
  robotId: string;
}

const RobotProgrammingOverlay = ({
  workspace,
  onDrop,
  onClose,
  onConfirm,
  robotId,
}: RobotProgrammingOverlayProps): JSX.Element => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return () => {};
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  return (
    <div className={styles.overlay} data-testid="robot-programming-overlay">
      <div className={styles.backdrop} aria-hidden="true" />
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="robot-programming-title"
        aria-describedby="robot-programming-description"
        ref={dialogRef}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Selected robot</p>
            <h2 id="robot-programming-title" className={styles.title}>
              Chassis {robotId}
            </h2>
            <p id="robot-programming-description" className={styles.description}>
              Build or refine a routine by combining blocks from the palette. Deploy your changes to see the chassis respond in
              the world.
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </header>
        <div className={styles.content}>
          <aside className={styles.palette}>
            <h3>Block palette</h3>
            <BlockPalette blocks={BLOCK_LIBRARY} />
          </aside>
          <section className={styles.workspace}>
            <h3>Workspace</h3>
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
    </div>
  );
};

export default RobotProgrammingOverlay;
