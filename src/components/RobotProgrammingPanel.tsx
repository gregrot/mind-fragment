import { useCallback, useLayoutEffect, useRef, type DragEvent } from 'react';
import BlockPalette from './BlockPalette';
import Workspace from './Workspace';
import RuntimeControls from './RuntimeControls';
import { BLOCK_LIBRARY } from '../blocks/library';
import type { WorkspaceState, DropTarget, BlockInstance, DragPayload } from '../types/blocks';
import styles from '../styles/RobotProgrammingPanel.module.css';
import useRobotTelemetry from '../hooks/useRobotTelemetry';
import type { Diagnostic } from '../simulation/runtime/blockProgram';
import type { RunProgramResult } from '../state/ProgrammingInspectorContext';

interface RobotProgrammingPanelProps {
  workspace: WorkspaceState;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
  onTouchDrop: (payload: DragPayload, target: DropTarget) => void;
  onUpdateBlock: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
  onRemoveBlock: (instanceId: string) => void;
  robotId: string;
  isReadOnly?: boolean;
  lockMessage?: string;
  onRequestStop?: () => void;
  moduleWarnings?: string[];
  activeBlockId?: string | null;
  warningBlockIds?: Set<string>;
  diagnostics: Diagnostic[];
  onRunProgram: () => RunProgramResult;
}

const RobotProgrammingPanel = ({
  workspace,
  onDrop,
  onTouchDrop,
  onUpdateBlock,
  onRemoveBlock,
  robotId,
  isReadOnly = false,
  lockMessage,
  onRequestStop,
  moduleWarnings,
  activeBlockId,
  warningBlockIds,
  diagnostics,
  onRunProgram,
}: RobotProgrammingPanelProps): JSX.Element => {
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const telemetry = useRobotTelemetry();
  const resolvedLockMessage = lockMessage
    ?? 'The routine is executing. Stop the program to edit blocks.';
  const hasWarnings = Array.isArray(moduleWarnings) && moduleWarnings.length > 0;
  const warningItems = moduleWarnings ?? [];
  const blockingDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

  useLayoutEffect(() => {
    const paletteList = paletteRef.current?.querySelector('[data-testid=\"block-palette-list\"]') as HTMLElement | null;
    const target = paletteList ?? paletteRef.current;
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start' });
    }
  }, [robotId]);

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
        <aside
          className={styles.palette}
          ref={paletteRef}
          data-read-only={isReadOnly ? 'true' : undefined}
        >
          <h4>Block palette</h4>
          <BlockPalette blocks={BLOCK_LIBRARY} onTouchDrop={onTouchDrop} />
        </aside>
        <section className={styles.workspace} data-read-only={isReadOnly ? 'true' : undefined}>
          <h4>Workspace</h4>
          {isReadOnly ? (
            <div className={styles.lockNotice} role="status" data-testid="program-lock-notice">
              <div>
                <strong className={styles.lockTitle}>Program running</strong>
                <p className={styles.lockMessage}>{resolvedLockMessage}</p>
              </div>
              {onRequestStop ? (
                <button
                  type="button"
                  className={styles.lockAction}
                  onClick={() => onRequestStop?.()}
                >
                  Stop program
                </button>
              ) : null}
            </div>
          ) : null}
          {hasWarnings ? (
            <div className={styles.warningPanel} role="alert" data-testid="module-warning-panel">
              <h5 className={styles.warningTitle}>Missing modules detected</h5>
              <ul className={styles.warningList}>
                {warningItems.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {blockingDiagnostics.length > 0 ? (
            <div className={styles.errorPanel} role="alert" data-testid="compile-error-panel">
              <h5 className={styles.errorTitle}>Resolve compile errors</h5>
              <p className={styles.errorDescription}>
                Fix the issues below before running the routine again. Adjust the affected blocks and retry.
              </p>
              <ul className={styles.errorList}>
                {blockingDiagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.message}-${index}`}>{diagnostic.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className={styles.workspaceSurface}>
            {isReadOnly ? <div className={styles.readOnlyOverlay} aria-hidden="true" /> : null}
            <Workspace
              blocks={workspace}
              onDrop={onDrop}
              onTouchDrop={onTouchDrop}
              onUpdateBlock={onUpdateBlock}
              onRemoveBlock={onRemoveBlock}
              telemetry={telemetry}
              activeBlockId={activeBlockId}
              warningBlockIds={warningBlockIds}
            />
          </div>
        </section>
      </div>
      <footer className={styles.footer}>
        <RuntimeControls robotId={robotId} onRun={onRunProgram} diagnostics={diagnostics} />
        <p className={styles.autosaveHint}>Changes save automatically while you edit.</p>
      </footer>
    </div>
  );
};

export default RobotProgrammingPanel;
