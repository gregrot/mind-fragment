import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RobotProgrammingInspector from '../RobotProgrammingInspector';
import { ProgrammingInspectorProvider } from '../../../state/ProgrammingInspectorContext';
import { createBlockInstance } from '../../../blocks/library';
import type { WorkspaceState } from '../../../types/blocks';
import type { EntityOverlayData } from '../../../types/overlay';
import type { SlotSchema } from '../../../types/slots';
import type { EntityId } from '../../../simulation/ecs/world';

vi.mock('../../../hooks/useRobotTelemetry', () => ({
  default: () => ({ robotId: 'MF-01', snapshot: { values: {}, actions: {} }, modules: [] }),
}));

let mockStatus: 'idle' | 'running' | 'completed' = 'idle';
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
  robotId: 'MF-01',
  name: 'Robot MF-01',
  description: 'Programming inspector test robot',
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

const renderInspector = (entity: EntityOverlayData, workspace: WorkspaceState) => {
  const contextValue = {
    workspace,
    onDrop: vi.fn(),
    onTouchDrop: vi.fn(),
    onUpdateBlock: vi.fn(),
    onRemoveBlock: vi.fn(),
    robotId: entity.robotId ?? 'MF-01',
  };

  return render(
    <ProgrammingInspectorProvider value={contextValue}>
      <RobotProgrammingInspector entity={entity} onClose={() => {}} />
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

describe('RobotProgrammingInspector', () => {
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
});
