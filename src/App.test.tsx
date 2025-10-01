import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { simulationRuntime } from './state/simulationRuntime';
import type { BlockInstruction, ExpressionNode } from './simulation/runtime/blockProgram';

afterEach(() => {
  cleanup();
});

const createDataTransfer = (): DataTransfer => {
  const store = new Map<string, string>();
  return {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [] as string[],
    setData: (format: string, value: string) => {
      store.set(format, value);
    },
    getData: (format: string) => store.get(format) ?? '',
    clearData: () => store.clear(),
    setDragImage: () => {},
  } as unknown as DataTransfer;
};

const getWorkspaceDropzone = (): HTMLElement => {
  const zones = screen.getAllByTestId('workspace-dropzone');
  return zones[zones.length - 1];
};

const clearWorkspace = async (): Promise<void> => {
  const workspace = getWorkspaceDropzone();
  const deleteButton = within(workspace).queryByTestId('block-start-delete');
  if (!deleteButton) {
    return;
  }
  fireEvent.click(deleteButton);
  await waitFor(() => {
    expect(within(getWorkspaceDropzone()).queryByTestId('block-start')).toBeNull();
  });
};

const getLatestStartBlock = (): HTMLElement => {
  const workspace = getWorkspaceDropzone();
  const startBlocks = within(workspace).getAllByTestId('block-start');
  return startBlocks[startBlocks.length - 1];
};

const stubElementFromPoint = (element: Element | null) => {
  const doc = document as Document & {
    elementFromPoint?: (x: number, y: number) => Element | null;
  };
  const original = doc.elementFromPoint;
  doc.elementFromPoint = () => element;
  return () => {
    if (original) {
      doc.elementFromPoint = original;
    } else {
      doc.elementFromPoint = () => null;
    }
  };
};

const dispatchCancelableTouchMove = (
  element: Element,
): ReturnType<typeof vi.fn> => {
  const moveEvent = new Event('touchmove', { bubbles: true, cancelable: true });
  Object.defineProperty(moveEvent, 'touches', {
    value: [{ clientX: 15, clientY: 15 } as unknown as Touch],
    configurable: true,
  });
  const originalPreventDefault = moveEvent.preventDefault.bind(moveEvent);
  const preventDefaultSpy = vi.fn(() => originalPreventDefault());
  Object.defineProperty(moveEvent, 'preventDefault', {
    value: preventDefaultSpy,
    configurable: true,
  });
  fireEvent(element, moveEvent);
  return preventDefaultSpy;
};

const renderAppWithOverlay = async () => {
  render(<App />);
  const programButtons = screen.getAllByTestId('select-mechanism');
  const programButton = programButtons[programButtons.length - 1];
  await act(async () => {
    fireEvent.click(programButton);
  });
  const overlays = await screen.findAllByTestId('entity-overlay');
  expect(overlays.length).toBeGreaterThan(0);

  await waitFor(() => {
    const workspace = getWorkspaceDropzone();
    const startBlock = within(workspace).getByTestId('block-start');
    const foreverBlock = within(startBlock).getByTestId('block-forever');
    expect(within(foreverBlock).getByTestId('block-scan-resources')).toBeInTheDocument();
  });

  const workspace = getWorkspaceDropzone();
  const startBlock = within(workspace).getByTestId('block-start');
  const foreverBlock = within(startBlock).getByTestId('block-forever');
  expect(within(foreverBlock).getAllByTestId('block-move-to')).toHaveLength(3);
  expect(within(foreverBlock).getAllByTestId('block-wait')).toHaveLength(2);
  expect(within(foreverBlock).getByTestId('block-use-item-slot')).toBeInTheDocument();
  expect(within(foreverBlock).getByTestId('block-gather-resource')).toBeInTheDocument();
  expect(within(foreverBlock).getByTestId('block-deposit-cargo')).toBeInTheDocument();
};

describe('block workspace drag and drop', () => {
  it('allows dragging a palette block into the workspace root', async () => {
    await renderAppWithOverlay();
    await clearWorkspace();

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const workspaceDropzone = getWorkspaceDropzone();
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(repeatPaletteItem, { dataTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer });

    const workspace = getWorkspaceDropzone();
    expect(within(workspace).getByTestId('block-repeat')).toBeInTheDocument();
  });

  it('supports dropping blocks into C-shaped slots', async () => {
    await renderAppWithOverlay();
    await clearWorkspace();

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const workspaceDropzone = getWorkspaceDropzone();
    const initialTransfer = createDataTransfer();

    fireEvent.dragStart(repeatPaletteItem, { dataTransfer: initialTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: initialTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: initialTransfer });

    const workspace = getWorkspaceDropzone();
    const repeatBlock = within(workspace).getByTestId('block-repeat');
    const doSlotDropzone = within(repeatBlock).getByTestId('slot-do-dropzone');

    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const moveTransfer = createDataTransfer();

    fireEvent.dragStart(movePaletteItem, { dataTransfer: moveTransfer });
    fireEvent.dragOver(doSlotDropzone, { dataTransfer: moveTransfer });
    fireEvent.drop(doSlotDropzone, { dataTransfer: moveTransfer });

    expect(within(repeatBlock).getByTestId('block-move')).toBeInTheDocument();
  });

  it('moves existing blocks between containers', async () => {
    await renderAppWithOverlay();
    await clearWorkspace();

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const workspaceDropzone = getWorkspaceDropzone();
    const repeatTransfer = createDataTransfer();

    fireEvent.dragStart(repeatPaletteItem, { dataTransfer: repeatTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: repeatTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: repeatTransfer });

    const workspace = getWorkspaceDropzone();
    const repeatBlock = within(workspace).getByTestId('block-repeat');
    const doSlotDropzone = within(repeatBlock).getByTestId('slot-do-dropzone');

    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const moveTransfer = createDataTransfer();

    fireEvent.dragStart(movePaletteItem, { dataTransfer: moveTransfer });
    fireEvent.dragOver(doSlotDropzone, { dataTransfer: moveTransfer });
    fireEvent.drop(doSlotDropzone, { dataTransfer: moveTransfer });

    const moveBlock = within(repeatBlock).getByTestId('block-move');
    const moveOutTransfer = createDataTransfer();

    fireEvent.dragStart(moveBlock, { dataTransfer: moveOutTransfer });
    const latestDropzone = getWorkspaceDropzone();
    fireEvent.dragOver(latestDropzone, { dataTransfer: moveOutTransfer });
    fireEvent.drop(latestDropzone, { dataTransfer: moveOutTransfer });

    const refreshedWorkspace = getWorkspaceDropzone();
    expect(within(refreshedWorkspace).getByTestId('block-move')).toBeInTheDocument();
    const updatedRepeat = within(refreshedWorkspace).getByTestId('block-repeat');
    expect(within(updatedRepeat).queryByTestId('block-move')).toBeNull();
  });

  it('allows event blocks to host starting behaviours', async () => {
    await renderAppWithOverlay();
    await clearWorkspace();

    const [startPaletteItem] = screen.getAllByTestId('palette-start');
    const workspaceDropzone = getWorkspaceDropzone();
    const startTransfer = createDataTransfer();

    fireEvent.dragStart(startPaletteItem, { dataTransfer: startTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: startTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: startTransfer });

    const startBlock = getLatestStartBlock();
    const doSlotDropzone = within(startBlock).getByTestId('slot-do-dropzone');

    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const moveTransfer = createDataTransfer();

    fireEvent.dragStart(movePaletteItem, { dataTransfer: moveTransfer });
    fireEvent.dragOver(doSlotDropzone, { dataTransfer: moveTransfer });
    fireEvent.drop(doSlotDropzone, { dataTransfer: moveTransfer });

    expect(within(startBlock).getByTestId('block-move')).toBeInTheDocument();
  });

  it('populates both branches of a parallel block', async () => {
    await renderAppWithOverlay();
    await clearWorkspace();

    const [parallelPaletteItem] = screen.getAllByTestId('palette-parallel');
    const workspaceDropzone = getWorkspaceDropzone();
    const parallelTransfer = createDataTransfer();

    fireEvent.dragStart(parallelPaletteItem, { dataTransfer: parallelTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: parallelTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: parallelTransfer });

    const workspace = getWorkspaceDropzone();
    const parallelBlock = within(workspace).getByTestId('block-parallel');
    const branchADropzone = within(parallelBlock).getByTestId('slot-branchA-dropzone');
    const branchBDropzone = within(parallelBlock).getByTestId('slot-branchB-dropzone');

    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const [turnPaletteItem] = screen.getAllByTestId('palette-turn');
    const moveTransfer = createDataTransfer();
    const turnTransfer = createDataTransfer();

    fireEvent.dragStart(movePaletteItem, { dataTransfer: moveTransfer });
    fireEvent.dragOver(branchADropzone, { dataTransfer: moveTransfer });
    fireEvent.drop(branchADropzone, { dataTransfer: moveTransfer });

    fireEvent.dragStart(turnPaletteItem, { dataTransfer: turnTransfer });
    fireEvent.dragOver(branchBDropzone, { dataTransfer: turnTransfer });
    fireEvent.drop(branchBDropzone, { dataTransfer: turnTransfer });

    expect(within(parallelBlock).getByTestId('block-move')).toBeInTheDocument();
    expect(within(parallelBlock).getByTestId('block-turn')).toBeInTheDocument();
  });

  it('prevents dropping a block into its own descendant', async () => {
    await renderAppWithOverlay();
    await clearWorkspace();

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const workspaceDropzone = getWorkspaceDropzone();
    const repeatTransfer = createDataTransfer();

    fireEvent.dragStart(repeatPaletteItem, { dataTransfer: repeatTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: repeatTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: repeatTransfer });

    const workspace = getWorkspaceDropzone();
    const repeatBlock = within(workspace).getByTestId('block-repeat');
    const doSlotDropzone = within(repeatBlock).getByTestId('slot-do-dropzone');

    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const moveTransfer = createDataTransfer();

    fireEvent.dragStart(movePaletteItem, { dataTransfer: moveTransfer });
    fireEvent.dragOver(doSlotDropzone, { dataTransfer: moveTransfer });
    fireEvent.drop(doSlotDropzone, { dataTransfer: moveTransfer });

    const repeatDrag = createDataTransfer();
    fireEvent.dragStart(repeatBlock, { dataTransfer: repeatDrag });
    fireEvent.dragOver(doSlotDropzone, { dataTransfer: repeatDrag });
    fireEvent.drop(doSlotDropzone, { dataTransfer: repeatDrag });

    const workspaceAfter = getWorkspaceDropzone();
    const repeatBlocks = within(workspaceAfter).getAllByTestId('block-repeat');
    expect(repeatBlocks).toHaveLength(1);
    expect(within(repeatBlocks[0]).getByTestId('block-move')).toBeInTheDocument();
  });

  it('restores saved workspaces when switching between mechanisms', async () => {
    await renderAppWithOverlay();
    await clearWorkspace();

    const [startPaletteItem] = screen.getAllByTestId('palette-start');
    const initialDropzone = getWorkspaceDropzone();
    const startTransfer = createDataTransfer();

    fireEvent.dragStart(startPaletteItem, { dataTransfer: startTransfer });
    fireEvent.dragOver(initialDropzone, { dataTransfer: startTransfer });
    fireEvent.drop(initialDropzone, { dataTransfer: startTransfer });

    let workspace = getWorkspaceDropzone();
    let startBlock = getLatestStartBlock();
    let doSlotDropzone = within(startBlock).getByTestId('slot-do-dropzone');
    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const moveTransfer = createDataTransfer();

    fireEvent.dragStart(movePaletteItem, { dataTransfer: moveTransfer });
    fireEvent.dragOver(doSlotDropzone, { dataTransfer: moveTransfer });
    fireEvent.drop(doSlotDropzone, { dataTransfer: moveTransfer });

    expect(within(startBlock).getByTestId('block-move')).toBeInTheDocument();

    act(() => {
      simulationRuntime.setSelectedMechanism('MF-02');
    });

    await waitFor(() => {
      const switchedWorkspace = getWorkspaceDropzone();
      expect(within(switchedWorkspace).queryByTestId('block-start')).toBeNull();
    });

    const [secondStartPaletteItem] = screen.getAllByTestId('palette-start');
    const secondDropzone = getWorkspaceDropzone();
    const secondStartTransfer = createDataTransfer();

    fireEvent.dragStart(secondStartPaletteItem, { dataTransfer: secondStartTransfer });
    fireEvent.dragOver(secondDropzone, { dataTransfer: secondStartTransfer });
    fireEvent.drop(secondDropzone, { dataTransfer: secondStartTransfer });

    workspace = getWorkspaceDropzone();
    startBlock = getLatestStartBlock();
    doSlotDropzone = within(startBlock).getByTestId('slot-do-dropzone');
    const [turnPaletteItem] = screen.getAllByTestId('palette-turn');
    const turnTransfer = createDataTransfer();

    fireEvent.dragStart(turnPaletteItem, { dataTransfer: turnTransfer });
    fireEvent.dragOver(doSlotDropzone, { dataTransfer: turnTransfer });
    fireEvent.drop(doSlotDropzone, { dataTransfer: turnTransfer });

    expect(within(startBlock).getByTestId('block-turn')).toBeInTheDocument();

    act(() => {
      simulationRuntime.setSelectedMechanism('MF-01');
    });

    await waitFor(() => {
      const restoredStart = getLatestStartBlock();
      expect(within(restoredStart).getByTestId('block-move')).toBeInTheDocument();
      expect(within(restoredStart).queryByTestId('block-turn')).toBeNull();
    });

    act(() => {
      simulationRuntime.clearSelectedMechanism();
    });
  });

  it('allows dropping a palette block into the workspace root via touch', async () => {
    await renderAppWithOverlay();

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const workspaceDropzone = getWorkspaceDropzone();
    const restoreElementFromPoint = stubElementFromPoint(workspaceDropzone);

    fireEvent.touchStart(repeatPaletteItem, {
      touches: [{ clientX: 10, clientY: 10 } as unknown as Touch],
    });
    fireEvent.touchEnd(repeatPaletteItem, {
      changedTouches: [{ clientX: 10, clientY: 10 } as unknown as Touch],
    });

    const workspace = getWorkspaceDropzone();
    await within(workspace).findByTestId('block-repeat');
    restoreElementFromPoint();
  });

  it('places palette blocks into nested slots when using touch input', async () => {
    await renderAppWithOverlay();

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const workspaceDropzone = getWorkspaceDropzone();
    const repeatTransfer = createDataTransfer();

    fireEvent.dragStart(repeatPaletteItem, { dataTransfer: repeatTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: repeatTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: repeatTransfer });

    const workspace = getWorkspaceDropzone();
    const repeatBlock = await within(workspace).findByTestId('block-repeat');
    const doSlotDropzone = within(repeatBlock).getByTestId('slot-do-dropzone');

    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const restoreElementFromPoint = stubElementFromPoint(doSlotDropzone);

    fireEvent.touchStart(movePaletteItem, {
      touches: [{ clientX: 5, clientY: 5 } as unknown as Touch],
    });
    fireEvent.touchEnd(movePaletteItem, {
      changedTouches: [{ clientX: 5, clientY: 5 } as unknown as Touch],
    });

    await within(repeatBlock).findByTestId('block-move');
    restoreElementFromPoint();
  });

  it('prevents default behaviour while dragging a palette block with touch', async () => {
    await renderAppWithOverlay();

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');

    fireEvent.touchStart(repeatPaletteItem, {
      touches: [{ clientX: 5, clientY: 5 } as unknown as Touch],
    });

    const preventDefault = dispatchCancelableTouchMove(repeatPaletteItem);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('prevents default behaviour while dragging a workspace block with touch', async () => {
    await renderAppWithOverlay();

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const workspaceDropzone = getWorkspaceDropzone();
    const repeatTransfer = createDataTransfer();

    fireEvent.dragStart(repeatPaletteItem, { dataTransfer: repeatTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: repeatTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: repeatTransfer });

    const workspace = getWorkspaceDropzone();
    const repeatBlock = await within(workspace).findByTestId('block-repeat');

    fireEvent.touchStart(repeatBlock, {
      touches: [{ clientX: 10, clientY: 10 } as unknown as Touch],
    });

    const preventDefault = dispatchCancelableTouchMove(repeatBlock);
    expect(preventDefault).toHaveBeenCalled();
  });
  it('compiles user-authored literals, signals, and operator expressions when Run Program is pressed', async () => {
    await renderAppWithOverlay();

    await clearWorkspace();

    const [startPaletteItem] = screen.getAllByTestId('palette-start');
    const workspaceDropzone = getWorkspaceDropzone();
    const startTransfer = createDataTransfer();

    fireEvent.dragStart(startPaletteItem, { dataTransfer: startTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: startTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: startTransfer });

    await waitFor(() => {
      const workspace = getWorkspaceDropzone();
      expect(within(workspace).getByTestId('block-start')).toBeInTheDocument();
    });

    const workspace = getWorkspaceDropzone();
    const startBlock = within(workspace).getByTestId('block-start');
    const startDoDropzone = within(startBlock).getByTestId('slot-do-dropzone');

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const repeatTransfer = createDataTransfer();
    fireEvent.dragStart(repeatPaletteItem, { dataTransfer: repeatTransfer });
    fireEvent.dragOver(startDoDropzone, { dataTransfer: repeatTransfer });
    fireEvent.drop(startDoDropzone, { dataTransfer: repeatTransfer });

    await waitFor(() => {
      const latestWorkspace = getWorkspaceDropzone();
      const refreshedStart = within(latestWorkspace).getByTestId('block-start');
      expect(within(refreshedStart).getByTestId('block-repeat')).toBeInTheDocument();
    });

    const repeatBlock = within(getWorkspaceDropzone()).getByTestId('block-repeat');
    const repeatDoDropzone = within(repeatBlock).getByTestId('slot-do-dropzone');
    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const moveTransfer = createDataTransfer();

    fireEvent.dragStart(movePaletteItem, { dataTransfer: moveTransfer });
    fireEvent.dragOver(repeatDoDropzone, { dataTransfer: moveTransfer });
    fireEvent.drop(repeatDoDropzone, { dataTransfer: moveTransfer });

    await waitFor(() => {
      const latestRepeat = within(getWorkspaceDropzone()).getByTestId('block-repeat');
      expect(within(latestRepeat).getByTestId('block-move')).toBeInTheDocument();
    });

    const countExpressionDropzone = within(getWorkspaceDropzone()).getByTestId(
      'block-repeat-parameter-count-expression-dropzone',
    );
    const [operatorPaletteItem] = screen.getAllByTestId('palette-operator-add');
    const operatorTransfer = createDataTransfer();

    fireEvent.dragStart(operatorPaletteItem, { dataTransfer: operatorTransfer });
    fireEvent.dragOver(countExpressionDropzone, { dataTransfer: operatorTransfer });
    fireEvent.drop(countExpressionDropzone, { dataTransfer: operatorTransfer });

    await waitFor(() => {
      const updatedRepeat = within(getWorkspaceDropzone()).getByTestId('block-repeat');
      expect(within(updatedRepeat).getByTestId('block-operator-add')).toBeInTheDocument();
    });

    const operatorBlock = within(getWorkspaceDropzone()).getByTestId('block-operator-add');
    const literalInputs = within(operatorBlock).getAllByTestId(
      'block-literal-number-parameter-value',
    ) as HTMLInputElement[];

    fireEvent.change(literalInputs[0], { target: { value: '4' } });
    fireEvent.blur(literalInputs[0]);
    fireEvent.change(literalInputs[1], { target: { value: '2' } });
    fireEvent.blur(literalInputs[1]);

    expect(literalInputs[0].value).toBe('4');
    expect(literalInputs[1].value).toBe('2');

    const [broadcastPaletteItem] = screen.getAllByTestId('palette-broadcast-signal');
    const broadcastTransfer = createDataTransfer();
    const refreshedStartBlock = within(getWorkspaceDropzone()).getByTestId('block-start');
    const refreshedDoDropzone = within(refreshedStartBlock).getAllByTestId('slot-do-dropzone')[0];

    fireEvent.dragStart(broadcastPaletteItem, { dataTransfer: broadcastTransfer });
    fireEvent.dragOver(refreshedDoDropzone, { dataTransfer: broadcastTransfer });
    fireEvent.drop(refreshedDoDropzone, { dataTransfer: broadcastTransfer });

    await waitFor(() => {
      const latestStart = within(getWorkspaceDropzone()).getByTestId('block-start');
      expect(within(latestStart).getAllByTestId('block-broadcast-signal').length).toBeGreaterThan(0);
    });

    const startWithSignal = within(getWorkspaceDropzone()).getByTestId('block-start');
    const broadcastBlocks = within(startWithSignal).getAllByTestId('block-broadcast-signal');
    const broadcastBlock = broadcastBlocks[broadcastBlocks.length - 1];
    const signalSelect = within(broadcastBlock).getByTestId(
      'block-broadcast-signal-parameter-signal',
    ) as HTMLSelectElement;

    fireEvent.change(signalSelect, { target: { value: 'alert.signal' } });
    expect(signalSelect.value).toBe('alert.signal');

    const runSpy = vi.spyOn(simulationRuntime, 'runProgram');
    const runButtons = screen.getAllByTestId('run-program');
    let matchedProgram: { instructions: BlockInstruction[] } | null = null;
    let matchedMechanismId: string | undefined;

    for (const button of runButtons) {
      runSpy.mockClear();
      fireEvent.click(button);
      const [mechanismId, program] = runSpy.mock.calls[0] ?? [];
      if (program?.instructions?.length) {
        matchedProgram = program;
        matchedMechanismId = mechanismId;
        break;
      }
    }

    expect(matchedMechanismId).toBe('MF-01');

    const instructions = matchedProgram?.instructions ?? [];
    expect(instructions).toHaveLength(1);
    const loopInstruction = instructions[0];
    if (!loopInstruction || loopInstruction.kind !== 'loop' || loopInstruction.mode !== 'counted') {
      throw new Error('Expected a counted loop to be emitted.');
    }

    const expression = loopInstruction.iterations.expression;
    expect(expression?.kind).toBe('operator');
    if (expression?.kind === 'operator') {
      expect(expression.operator).toBe('add');
      const literalInputs = expression.inputs.filter(
        (input): input is Extract<ExpressionNode, { kind: 'literal' }> => input.kind === 'literal',
      );
      const literalValues = literalInputs.map((input) => ({ value: input.value, source: input.source }));
      expect(literalValues).toEqual([
        { value: 4, source: 'user' },
        { value: 2, source: 'user' },
      ]);
    }

    runSpy.mockRestore();
  });

  it('persists compile errors when navigating away from the programming tab', async () => {
    await renderAppWithOverlay();

    await clearWorkspace();

    const runSpy = vi.spyOn(simulationRuntime, 'runProgram');
    const runButtons = screen.getAllByTestId('run-program');
    const targetRun = runButtons[runButtons.length - 1];
    fireEvent.click(targetRun);

    const errorPanel = await screen.findByTestId('compile-error-panel');
    expect(errorPanel).toHaveTextContent(/resolve compile errors/i);
    expect(simulationRuntime.getStatus('MF-01')).toBe('error');
    expect(runSpy).not.toHaveBeenCalled();

    const systemsTab = screen.getAllByRole('tab', { name: 'Systems' }).pop();
    if (!systemsTab) {
      throw new Error('Expected Systems tab to be present.');
    }
    fireEvent.click(systemsTab);
    await waitFor(() => {
      expect(systemsTab).toHaveAttribute('aria-selected', 'true');
    });

    const programmingTab = screen.getAllByRole('tab', { name: 'Programming' }).pop();
    if (!programmingTab) {
      throw new Error('Expected Programming tab to be present.');
    }
    fireEvent.click(programmingTab);
    await waitFor(() => {
      expect(programmingTab).toHaveAttribute('aria-selected', 'true');
    });

    const restoredPanel = await screen.findByTestId('compile-error-panel');
    expect(restoredPanel).toBeInTheDocument();
    expect(restoredPanel).toHaveTextContent(/When Started/i);
    runSpy.mockRestore();
  });
});
