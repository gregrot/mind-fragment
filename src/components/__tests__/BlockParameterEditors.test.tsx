import { cleanup, fireEvent, render, screen, within, act, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BlockView from '../BlockView';
import BlockParameterSignalSelect from '../BlockParameterSignalSelect';
import { BLOCK_MAP, createBlockInstance } from '../../blocks/library';
import type { BlockInstance } from '../../types/blocks';
import useRobotTelemetry from '../../hooks/useRobotTelemetry';
import { simulationRuntime } from '../../state/simulationRuntime';
import type { SimulationTelemetrySnapshot } from '../../simulation/runtime/ecsBlackboard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Block parameter editors', () => {
  const renderBlockView = (block: BlockInstance, options: { onDrop?: ReturnType<typeof vi.fn>; onUpdateBlock?: ReturnType<typeof vi.fn> } = {}) => {
    const onDrop = options.onDrop ?? vi.fn();
    const onUpdateBlock = options.onUpdateBlock ?? vi.fn();

    render(
      <BlockView
        block={block}
        path={[]}
        onDrop={onDrop}
        onUpdateBlock={onUpdateBlock}
      />,
    );

    return { onDrop, onUpdateBlock };
  };

  it('updates numeric parameters when editing the field value', () => {
    const block = createBlockInstance('repeat');
    const { onUpdateBlock } = renderBlockView(block);

    const input = screen.getByTestId('block-repeat-parameter-count') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '6' } });

    expect(onUpdateBlock).toHaveBeenCalledTimes(1);
    const updater = onUpdateBlock.mock.calls[0][1];
    const updated = updater(block);
    expect(updated.parameters?.count).toEqual({ kind: 'number', value: 6 });
  });

  it('allows partial numeric entry before committing decimals or negatives', () => {
    const block = createBlockInstance('repeat');
    let currentBlock = block;
    const { onUpdateBlock } = renderBlockView(block);

    const input = screen.getByTestId('block-repeat-parameter-count') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '-' } });
    expect(onUpdateBlock).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '-2' } });
    expect(onUpdateBlock).toHaveBeenCalledTimes(1);
    let updater = onUpdateBlock.mock.calls[0][1];
    currentBlock = updater(currentBlock);
    expect(currentBlock.parameters?.count).toEqual({ kind: 'number', value: -2 });

    onUpdateBlock.mockClear();

    fireEvent.change(input, { target: { value: '0.' } });
    expect(onUpdateBlock).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '0.75' } });
    expect(onUpdateBlock).toHaveBeenCalledTimes(1);
    updater = onUpdateBlock.mock.calls[0][1];
    currentBlock = updater(currentBlock);
    expect(currentBlock.parameters?.count).toEqual({ kind: 'number', value: 0.75 });
  });

  it('allows selecting a signal option for signal parameters', () => {
    const block = createBlockInstance('broadcast-signal');
    const { onUpdateBlock } = renderBlockView(block);

    const select = screen.getByTestId('block-broadcast-signal-parameter-signal') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'alert.signal' } });

    expect(onUpdateBlock).toHaveBeenCalledTimes(1);
    const updater = onUpdateBlock.mock.calls[0][1];
    const updated = updater(block);
    expect(updated.parameters?.signal).toEqual({ kind: 'signal', value: 'alert.signal' });
  });

  it('emits a parameter expression drop target when dropping into the value zone', () => {
    const block = createBlockInstance('repeat');
    const { onDrop } = renderBlockView(block);

    const container = screen.getByTestId('block-repeat-parameter-count-expression');
    const dropZone = within(container).getByTestId('block-repeat-parameter-count-expression-dropzone');

    fireEvent.drop(dropZone);

    expect(onDrop).toHaveBeenCalledTimes(1);
    const [, target] = onDrop.mock.calls[0];
    expect(target).toEqual({
      kind: 'parameter-expression',
      ownerId: block.instanceId,
      parameterName: 'count',
      position: 0,
      ancestorIds: [block.instanceId],
    });
  });

  it('refreshes signal options when telemetry snapshots change', async () => {
    const block = createBlockInstance('broadcast-signal');
    const definition = BLOCK_MAP['broadcast-signal'].parameters?.signal;
    if (!definition || definition.kind !== 'signal') {
      throw new Error('Signal parameter definition not found.');
    }

    const initialSnapshot: SimulationTelemetrySnapshot = {
      values: {
        'status.signal': {
          active: {
            value: true,
            metadata: { label: 'Indicator active' },
            revision: 1,
          },
        },
      },
      actions: {},
    };

    const updatedSnapshot: SimulationTelemetrySnapshot = {
      values: {
        'status.signal': {
          active: {
            value: false,
            metadata: { label: 'Indicator engaged' },
            revision: 2,
          },
        },
      },
      actions: {},
    };

    let telemetryListener: ((snapshot: SimulationTelemetrySnapshot, robotId: string | null) => void) | null = null;

    vi.spyOn(simulationRuntime, 'getSelectedRobot').mockReturnValue('MF-01');
    vi.spyOn(simulationRuntime, 'getTelemetrySnapshot').mockReturnValue(initialSnapshot);
    vi.spyOn(simulationRuntime, 'subscribeTelemetry').mockImplementation((listener) => {
      telemetryListener = listener;
      listener(initialSnapshot, 'MF-01');
      return () => {};
    });

    const Harness = () => {
      const telemetry = useRobotTelemetry();
      return (
        <BlockParameterSignalSelect
          block={block}
          parameterName="signal"
          definition={definition}
          value={block.parameters?.signal}
          label="Signal"
          testId="block-broadcast-signal-parameter-signal"
          onUpdateBlock={vi.fn()}
          telemetry={telemetry}
        />
      );
    };

    render(<Harness />);

    const select = screen.getByTestId('block-broadcast-signal-parameter-signal') as HTMLSelectElement;
    const optionLabels = () => Array.from(select.options).map((option) => option.textContent);

    expect(optionLabels()).toContain('Indicator active');
    expect(telemetryListener).not.toBeNull();

    act(() => {
      telemetryListener?.(updatedSnapshot, 'MF-01');
    });

    await waitFor(() => {
      expect(optionLabels()).toContain('Indicator engaged');
    });
  });
});
