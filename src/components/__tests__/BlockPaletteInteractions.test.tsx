import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BlockPalette, { type PaletteBlockEntry } from '../BlockPalette';
import BlockView from '../BlockView';
import { BLOCK_LIBRARY, createBlockInstance } from '../../blocks/library';

const paletteBlocks: PaletteBlockEntry[] = BLOCK_LIBRARY.map((definition) => ({
  definition,
  isLocked: false,
}));

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
    render(<BlockPalette blocks={paletteBlocks} />);

    expect(screen.getByText('Values & Signals')).toBeInTheDocument();
    expect(screen.getByText('Operators')).toBeInTheDocument();

    const numberLiteral = screen.getByTestId('palette-literal-number');
    expect(numberLiteral).toHaveAttribute('role', 'listitem');
    expect(within(numberLiteral).getByText('Value', { selector: 'span' })).toBeInTheDocument();

    const operatorBlock = screen.getByTestId('palette-operator-greater-than');
    expect(within(operatorBlock).getByText(/Operator/i)).toBeInTheDocument();
  });

  it('supports dragging value blocks into boolean parameter drop zones', () => {
    const handleDrop = vi.fn();
    const conditional = createBlockInstance('if');
    if (conditional.expressionInputs) {
      conditional.expressionInputs.condition = [];
    }

    render(
      <div>
        <BlockPalette blocks={paletteBlocks} />
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

  it('supports dropping operator blocks into numeric expression inputs', () => {
    const handleDrop = vi.fn();
    const repeat = createBlockInstance('repeat');
    if (repeat.expressionInputs) {
      repeat.expressionInputs.count = [];
    }

    render(
      <div>
        <BlockPalette blocks={paletteBlocks} />
        <BlockView block={repeat} path={[]} onDrop={handleDrop} />
      </div>,
    );

    const [operatorAdd] = screen.getAllByTestId('palette-operator-add');
    const dropZone = screen.getByTestId('block-repeat-parameter-count-expression-dropzone');

    const dataTransfer = createMockDataTransfer();

    fireEvent.dragStart(operatorAdd, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'application/json',
      expect.stringContaining('"blockType":"operator-add"'),
    );

    fireEvent.drop(dropZone, { dataTransfer });

    expect(handleDrop).toHaveBeenCalledTimes(1);
    const [, target] = handleDrop.mock.calls[0];
    expect(target).toMatchObject({ kind: 'parameter-expression', parameterName: 'count' });
  });

  it('filters palette items using the search input', () => {
    render(<BlockPalette blocks={paletteBlocks} />);

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
