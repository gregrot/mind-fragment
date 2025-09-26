import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Diagnostic } from '../simulation/runtime/blockProgram';
import { useSimulationRuntime } from '../hooks/useSimulationRuntime';
import styles from '../styles/RuntimeControls.module.css';
import type { RunProgramResult } from '../state/ProgrammingInspectorContext';

interface RuntimeControlsProps {
  robotId: string;
  onRun: () => RunProgramResult;
  diagnostics: Diagnostic[];
}

const formatStatus = (status: string): string => {
  switch (status) {
    case 'running':
      return 'Executing routine';
    case 'completed':
      return 'Routine completed';
    case 'error':
      return 'Compile failed';
    default:
      return 'Idle';
  }
};

const RuntimeControls = ({ robotId, onRun, diagnostics }: RuntimeControlsProps): JSX.Element => {
  const { status, stopProgram } = useSimulationRuntime(robotId);
  const [footerDiagnostics, setFooterDiagnostics] = useState<Diagnostic[]>(() =>
    diagnostics.filter((diagnostic) => diagnostic.severity !== 'error'),
  );

  const handleRun = useCallback(() => {
    const result = onRun();
    const nonBlockingDiagnostics = result.diagnostics.filter((diagnostic) => diagnostic.severity !== 'error');
    if (nonBlockingDiagnostics.length > 0) {
      setFooterDiagnostics(nonBlockingDiagnostics);
      return;
    }
    if (!result.blocked) {
      const stepCount = result.stepCount;
      if (stepCount > 0) {
        setFooterDiagnostics([
          {
            severity: 'info',
            message: `Queued ${stepCount} ${stepCount === 1 ? 'step' : 'steps'} for execution.`,
          },
        ]);
        return;
      }
    }
    setFooterDiagnostics([]);
  }, [onRun]);

  const handleStop = useCallback(() => {
    stopProgram();
  }, [stopProgram]);

  const statusLabel = useMemo(() => formatStatus(status), [status]);

  useEffect(() => {
    setFooterDiagnostics(diagnostics.filter((diagnostic) => diagnostic.severity !== 'error'));
  }, [diagnostics]);

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
      {footerDiagnostics.length > 0 ? (
        <ul className={styles.diagnostics}>
          {footerDiagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.message}-${index}`}
              className={styles.diagnosticItem}
              data-severity={diagnostic.severity}
            >
              <span className={styles.diagnosticIcon} aria-hidden="true">
                {diagnostic.severity === 'warning'
                  ? '⚠️'
                  : diagnostic.severity === 'error'
                    ? '⛔️'
                    : 'ℹ️'}
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
