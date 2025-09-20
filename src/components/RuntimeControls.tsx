import { useCallback, useMemo, useState } from 'react';
import type { WorkspaceState } from '../types/blocks';
import type { Diagnostic } from '../simulation/runtime/blockProgram';
import { compileWorkspaceProgram } from '../simulation/runtime/blockProgram';
import { useSimulationRuntime } from '../hooks/useSimulationRuntime';

interface RuntimeControlsProps {
  workspace: WorkspaceState;
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

const RuntimeControls = ({ workspace }: RuntimeControlsProps): JSX.Element => {
  const { status, runProgram, stopProgram } = useSimulationRuntime();
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
    <div className="runtime-controls" data-testid="runtime-controls">
      <div className="runtime-actions">
        <button
          type="button"
          onClick={handleRun}
          disabled={status === 'running'}
          className="runtime-button primary"
          data-testid="run-program"
        >
          {status === 'running' ? 'Running…' : 'Run Program'}
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={status !== 'running'}
          className="runtime-button secondary"
          data-testid="stop-program"
        >
          Stop
        </button>
      </div>
      <p className="runtime-status">
        <strong>Status:</strong> {statusLabel}
      </p>
      {diagnostics.length > 0 ? (
        <ul className="runtime-diagnostics">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.message}-${index}`} data-severity={diagnostic.severity}>
              <span className="runtime-diagnostic-icon" aria-hidden="true">
                {diagnostic.severity === 'warning' ? '⚠️' : 'ℹ️'}
              </span>
              <span>{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="runtime-hint">Drag a "When Started" block into the workspace, add movement blocks, and press Run.</p>
      )}
    </div>
  );
};

export default RuntimeControls;
