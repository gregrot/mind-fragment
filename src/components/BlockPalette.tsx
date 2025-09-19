import type { DragEvent } from 'react';
import type { BlockDefinition } from '../types/blocks';

const PAYLOAD_MIME = 'application/json';

interface BlockPaletteProps {
  blocks: BlockDefinition[];
}

const BlockPalette = ({ blocks }: BlockPaletteProps): JSX.Element => {
  const handleDragStart = (definition: BlockDefinition) => (event: DragEvent<HTMLDivElement>) => {
    const payload = {
      source: 'palette',
      blockType: definition.id
    };

    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.dropEffect = 'copy';
    event.dataTransfer.setData(PAYLOAD_MIME, JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', definition.label);
  };

  return (
    <div className="block-palette" role="list">
      {blocks.map((definition) => (
        <div
          key={definition.id}
          role="listitem"
          className={`palette-item palette-item-${definition.category}`}
          draggable
          onDragStart={handleDragStart(definition)}
          data-testid={`palette-${definition.id}`}
        >
          <span className="palette-label">{definition.label}</span>
          {definition.summary ? <small className="palette-summary">{definition.summary}</small> : null}
        </div>
      ))}
    </div>
  );
};

export default BlockPalette;
