import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MechanismProgrammingInspector from '../MechanismProgrammingInspector';
import { ProgrammingInspectorProvider } from '../../../state/ProgrammingInspectorContext';
import { createBlockInstance } from '../../../blocks/library';
import type { WorkspaceState } from '../../../types/blocks';
import type { EntityOverlayData } from '../../../types/overlay';
import type { SlotSchema } from '../../../types/slots';
import type { EntityId } from '../../../simulation/ecs/world';
import type { Diagnostic } from '../../../simulation/runtime/blockProgram';
import type { ProgramRunnerStatus } from '../../../simulation/runtime/blockProgramRunner';

vi.mock('../../../hooks/useMechanismTelemetry', () => ({
  default: () => ({ mechanismId: 'MF-01', snapshot: { values: {}, actions: {} }, modules: [] }),
}));

let mockStatus: ProgramRunnerStatus = 'idle';
const stopProgramMock = vi.fn();

vi.mock('../../../hooks/useSimulationRuntime', () => ({
  useSimulationRuntime: () => ({
    status: mockStatus,
    stopProgram: stopProgramMock,
    runProgram: vi.fn(),
  }),
}));

const createSlot = (id: string, index: number, occupantId: string | null): SlotSchema => ({
  id,
  index,
  occupantId,
  metadata: {
    stackable: false,
    locked: false,
    moduleSubtype: undefined,
  },
});

const createEntity = (overrides?: Partial<EntityOverlayData>): EntityOverlayData => ({
  entityId: 1 as EntityId,
  mechanismId: 'MF-01',
  name: 'Mechanism MF-01',
  description: 'Programming inspector test mechanism',
  overlayType: 'complex',
  chassis: {
    capacity: overrides?.chassis?.capacity ?? 3,
    slots: overrides?.chassis?.slots ?? [createSlot('core-0', 0, 'core.movement')],
  },
  inventory: overrides?.inventory,
  programState: overrides?.programState ?? { isRunning: false, activeBlockId: null },
});

const createWorkspaceWithMoveBlock = (): WorkspaceState => {
  const start = createBlockInstance('start');
  const moveBlock = createBlockInstance('move');
  start.slots = { ...start.slots, do: [moveBlock] };
  return [start];
};

const renderInspector = (
  entity: EntityOverlayData,
  workspace: WorkspaceState,
  diagnostics: Diagnostic[] = [],
) => {
  const contextValue = {
    workspace,
    onDrop: vi.fn(),
    onTouchDrop: vi.fn(),
    onUpdateBlock: vi.fn(),
    onRemoveBlock: vi.fn(),
    mechanismId: entity.mechanismId ?? 'MF-01',
    runProgram: vi.fn(() => ({ diagnostics: [], stepCount: 0, blocked: false })),
    diagnostics,
  };

  return render(
    <ProgrammingInspectorProvider value={contextValue}>
      <MechanismProgrammingInspector entity={entity} onClose={() => {}} />
    </ProgrammingInspectorProvider>,
  );
};

beforeEach(() => {
  mockStatus = 'idle';
  stopProgramMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('MechanismProgrammingInspector', () => {
  it('shows a lock notice and stop control when the program is running', () => {
    mockStatus = 'running';
    const workspace = createWorkspaceWithMoveBlock();
    const entity = createEntity({ programState: { isRunning: true, activeBlockId: workspace[0]?.slots?.do?.[0]?.instanceId ?? null } });

    renderInspector(entity, workspace);

    expect(screen.getByTestId('program-lock-notice')).toBeInTheDocument();
    const stopButton = screen.getByRole('button', { name: /stop program/i });
    fireEvent.click(stopButton);
    expect(stopProgramMock).toHaveBeenCalledTimes(1);
  });

  it('highlights blocks and warns when required modules are missing', () => {
    mockStatus = 'idle';
    const workspace = createWorkspaceWithMoveBlock();
    const moveBlockId = workspace[0]?.slots?.do?.[0]?.instanceId ?? null;
    const entity = createEntity({
      chassis: {
        capacity: 1,
        slots: [createSlot('core-0', 0, null)],
      },
      programState: { isRunning: false, activeBlockId: moveBlockId },
    });

    renderInspector(entity, workspace);

    expect(screen.getByTestId('module-warning-panel')).toBeInTheDocument();
    expect(screen.getByText(/locomotion thrusters mk1/i)).toBeInTheDocument();
    const moveBlock = screen.getByTestId('block-move');
    expect(moveBlock).toHaveAttribute('data-state-warning', 'true');
  });

  it('displays compile errors inline with guidance to resolve them', () => {
    mockStatus = 'idle';
    const workspace = createWorkspaceWithMoveBlock();
    const entity = createEntity();
    const diagnostics: Diagnostic[] = [
      { severity: 'error', message: 'Add a "When Started" block to trigger the routine.' },
    ];

    renderInspector(entity, workspace, diagnostics);

    const errorPanel = screen.getByTestId('compile-error-panel');
    expect(errorPanel).toBeInTheDocument();
    expect(errorPanel).toHaveTextContent(/resolve compile errors/i);
    expect(errorPanel).toHaveTextContent(/fix the issues below/i);
    expect(errorPanel).toHaveTextContent(/When Started/i);
  });
});
