import type { DragEvent } from 'react';
import type { BlockDefinition } from '../types/blocks';
import styles from '../styles/BlockPalette.module.css';

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
    <div className={styles.blockPalette} role="list" data-testid="block-palette-list">
      {blocks.map((definition) => {
        const paletteItemClasses = [styles.paletteItem];
        switch (definition.category) {
          case 'action':
            paletteItemClasses.push(styles.paletteItemAction);
            break;
          case 'c':
            paletteItemClasses.push(styles.paletteItemC);
            break;
          case 'event':
            paletteItemClasses.push(styles.paletteItemEvent);
            break;
          default:
            paletteItemClasses.push(styles.paletteItemAction);
            break;
        }
        const paletteItemClass = paletteItemClasses.join(' ');
        return (
          <div
            key={definition.id}
            role="listitem"
            className={paletteItemClass}
            draggable
            onDragStart={handleDragStart(definition)}
            data-testid={`palette-${definition.id}`}
          >
            <span className={styles.paletteLabel}>{definition.label}</span>
            {definition.summary ? <small className={styles.paletteSummary}>{definition.summary}</small> : null}
          </div>
        );
      })}
    </div>
  );
};

export default BlockPalette;
