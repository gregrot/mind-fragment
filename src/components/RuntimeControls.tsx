import { useCallback, useMemo, useState } from 'react';
import type { WorkspaceState } from '../types/blocks';
import type { Diagnostic } from '../simulation/runtime/blockProgram';
import { compileWorkspaceProgram } from '../simulation/runtime/blockProgram';
import { useSimulationRuntime } from '../hooks/useSimulationRuntime';
import styles from '../styles/RuntimeControls.module.css';

interface RuntimeControlsProps {
  workspace: WorkspaceState;
  robotId: string;
}

const formatStatus = (status: string): string => {
  switch (status) {
    case 'running':
      return 'Executing routine';
    case 'completed':
      return 'Routine completed';
    default:
      return 'Idle';
  }
};

const RuntimeControls = ({ workspace, robotId }: RuntimeControlsProps): JSX.Element => {
  const { status, runProgram, stopProgram } = useSimulationRuntime(robotId);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  const handleRun = useCallback(() => {
    const result = compileWorkspaceProgram(workspace);
    const stepCount = result.program.instructions.length;
    const infoMessage = stepCount
      ? [{
          severity: 'info' as const,
          message: `Queued ${stepCount} ${stepCount === 1 ? 'step' : 'steps'} for execution.`,
        }]
      : [];
    setDiagnostics(result.diagnostics.length > 0 ? result.diagnostics : infoMessage);
    runProgram(result.program);
  }, [runProgram, workspace]);

  const handleStop = useCallback(() => {
    stopProgram();
  }, [stopProgram]);

  const statusLabel = useMemo(() => formatStatus(status), [status]);

  return (
    <div className={styles.controls} data-testid="runtime-controls">
      <div className={styles.actions}>
        <button
          type="button"
          onClick={handleRun}
          disabled={status === 'running'}
          className={`${styles.button} ${styles.primary}`}
          data-testid="run-program"
        >
          {status === 'running' ? 'Running…' : 'Run Program'}
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={status !== 'running'}
          className={`${styles.button} ${styles.secondary}`}
          data-testid="stop-program"
        >
          Stop
        </button>
      </div>
      <p className={styles.status}>
        <strong>Status:</strong> {statusLabel}
      </p>
      {diagnostics.length > 0 ? (
        <ul className={styles.diagnostics}>
          {diagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.message}-${index}`}
              className={styles.diagnosticItem}
              data-severity={diagnostic.severity}
            >
              <span className={styles.diagnosticIcon} aria-hidden="true">
                {diagnostic.severity === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <span>{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.hint}>Drag a "When Started" block into the workspace, add movement blocks, and press Run.</p>
      )}
    </div>
  );
};

export default RuntimeControls;
