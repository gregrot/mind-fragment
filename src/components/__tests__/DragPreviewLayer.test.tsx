import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import DragPreviewLayer from '../DragPreviewLayer';
import { DragProvider, useDragContext } from '../../state/DragContext';

const StartDrag = (): null => {
  const { startDrag } = useDragContext();

  useEffect(() => {
    startDrag(
      {
        source: { type: 'inventory-slot', id: 'slot-test' },
        payload: { id: 'module-test', itemType: 'module' },
        preview: {
          render: () => <span data-testid="preview-content">Module</span>,
          width: 40,
          height: 40,
        },
      },
      { pointer: { x: 10, y: 20 } },
    );
  }, [startDrag]);

  return null;
};

describe('DragPreviewLayer', () => {
  it('renders the drag preview when a session is active', async () => {
    render(
      <DragProvider>
        <StartDrag />
        <DragPreviewLayer />
      </DragProvider>,
    );

    const preview = await screen.findByTestId('drag-preview');
    expect(preview).toBeInTheDocument();
    expect(screen.getByTestId('preview-content')).toBeInTheDocument();
  });
});
