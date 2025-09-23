import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BlockPalette from '../BlockPalette';
import BlockView from '../BlockView';
import { BLOCK_LIBRARY, createBlockInstance } from '../../blocks/library';

const createMockDataTransfer = (): DataTransfer => {
  const store = new Map<string, string>();

  return {
    dropEffect: 'copy',
    effectAllowed: 'all',
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    getData: vi.fn((type: string) => store.get(type) ?? ''),
    clearData: vi.fn(() => {
      store.clear();
    }),
    setDragImage: vi.fn(),
    get files() {
      return [] as unknown as FileList;
    },
    get items() {
      return [] as unknown as DataTransferItemList;
    },
    get types() {
      return Array.from(store.keys());
    },
  } as DataTransfer;
};

describe('BlockPalette value and operator blocks', () => {
  it('renders grouped value and operator sections with badges', () => {
    render(<BlockPalette blocks={BLOCK_LIBRARY} />);

    expect(screen.getByText('Values & Signals')).toBeInTheDocument();
    expect(screen.getByText('Operators')).toBeInTheDocument();

    const numberLiteral = screen.getByTestId('palette-literal-number');
    expect(within(numberLiteral).getByText('Number Literal')).toBeInTheDocument();
    expect(within(numberLiteral).getByText('Value')).toBeInTheDocument();

    const operatorBlock = screen.getByTestId('palette-operator-greater-than');
    expect(within(operatorBlock).getByText('Operator')).toBeInTheDocument();
  });

  it('supports dragging value blocks into boolean parameter drop zones', () => {
    const handleDrop = vi.fn();
    const conditional = createBlockInstance('if');
    if (conditional.expressionInputs) {
      conditional.expressionInputs.condition = [];
    }

    render(
      <div>
        <BlockPalette blocks={BLOCK_LIBRARY} />
        <BlockView block={conditional} path={[]} onDrop={handleDrop} />
      </div>,
    );

    const [literalBoolean] = screen.getAllByTestId('palette-literal-boolean');
    const dropZone = screen.getByTestId('block-if-parameter-condition-expression-dropzone');

    const dataTransfer = createMockDataTransfer();

    fireEvent.dragStart(literalBoolean, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/json',
      expect.stringContaining('"blockType":"literal-boolean"'),
    );

    fireEvent.drop(dropZone, { dataTransfer });

    expect(handleDrop).toHaveBeenCalledTimes(1);
    const [, target] = handleDrop.mock.calls[0];
    expect(target).toMatchObject({ kind: 'parameter-expression', parameterName: 'condition' });
  });

  it('filters palette items using the search input', () => {
    render(<BlockPalette blocks={BLOCK_LIBRARY} />);

    const filters = screen.getAllByLabelText('Filter blocks');
    filters.forEach((input) => {
      fireEvent.change(input, { target: { value: 'operator' } });
    });

    const paletteLists = screen.getAllByTestId('block-palette-list');
    paletteLists.forEach((list) => {
      expect(within(list).queryByTestId('palette-move')).toBeNull();
    });
    expect(within(paletteLists[0]).getAllByTestId(/^palette-operator-/i)).not.toHaveLength(0);
  });
});
