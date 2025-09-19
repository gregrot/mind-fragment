import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App.jsx';

const createDataTransfer = () => {
  const store = new Map();
  return {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [],
    types: [],
    setData: (format, value) => {
      store.set(format, value);
    },
    getData: (format) => store.get(format) ?? '',
    clearData: () => store.clear(),
    setDragImage: () => {}
  };
};

const getWorkspaceDropzone = () => {
  const zones = screen.getAllByTestId('workspace-dropzone');
  return zones[zones.length - 1];
};

describe('block workspace drag and drop', () => {
  it('allows dragging a palette block into the workspace root', () => {
    render(<App />);

    const [repeatPaletteItem] = screen.getAllByTestId('palette-repeat');
    const workspaceDropzone = getWorkspaceDropzone();
    const dataTransfer = createDataTransfer();

    fireEvent.dragStart(repeatPaletteItem, { dataTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer });

    const workspace = getWorkspaceDropzone();
    expect(within(workspace).getByTestId('block-repeat')).toBeInTheDocument();
  });

  it('supports dropping blocks into C-shaped slots', () => {
    render(<App />);

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

  it('moves existing blocks between containers', () => {
    render(<App />);

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

  it('allows event blocks to host starting behaviours', () => {
    render(<App />);

    const [startPaletteItem] = screen.getAllByTestId('palette-start');
    const workspaceDropzone = getWorkspaceDropzone();
    const startTransfer = createDataTransfer();

    fireEvent.dragStart(startPaletteItem, { dataTransfer: startTransfer });
    fireEvent.dragOver(workspaceDropzone, { dataTransfer: startTransfer });
    fireEvent.drop(workspaceDropzone, { dataTransfer: startTransfer });

    const workspace = getWorkspaceDropzone();
    const startBlock = within(workspace).getByTestId('block-start');
    const doSlotDropzone = within(startBlock).getByTestId('slot-do-dropzone');

    const [movePaletteItem] = screen.getAllByTestId('palette-move');
    const moveTransfer = createDataTransfer();

    fireEvent.dragStart(movePaletteItem, { dataTransfer: moveTransfer });
    fireEvent.dragOver(doSlotDropzone, { dataTransfer: moveTransfer });
    fireEvent.drop(doSlotDropzone, { dataTransfer: moveTransfer });

    expect(within(startBlock).getByTestId('block-move')).toBeInTheDocument();
  });

  it('populates both branches of a parallel block', () => {
    render(<App />);

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

  it('prevents dropping a block into its own descendant', () => {
    render(<App />);

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
});
