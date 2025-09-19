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
});
