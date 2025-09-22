import { useCallback, useRef, type DragEvent, type TouchEvent as ReactTouchEvent } from 'react';
import type { BlockDefinition, DragPayload, DropTarget } from '../types/blocks';
import { getDropTargetFromTouchEvent } from '../utils/dropTarget';
import styles from '../styles/BlockPalette.module.css';

const PAYLOAD_MIME = 'application/json';

interface BlockPaletteProps {
  blocks: BlockDefinition[];
  onTouchDrop?: (payload: DragPayload, target: DropTarget) => void;
}

const BlockPalette = ({ blocks, onTouchDrop }: BlockPaletteProps): JSX.Element => {
  const touchPayloadRef = useRef<DragPayload | null>(null);

  const handleDragStart = useCallback((definition: BlockDefinition) => (event: DragEvent<HTMLDivElement>) => {
    const payload = {
      source: 'palette',
      blockType: definition.id
    };

    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.dropEffect = 'copy';
    event.dataTransfer.setData(PAYLOAD_MIME, JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', definition.label);
  }, []);

  const handleTouchStart = useCallback(
    (definition: BlockDefinition) => (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!onTouchDrop) {
        return;
      }

      touchPayloadRef.current = { source: 'palette', blockType: definition.id };
      event.stopPropagation();
    },
    [onTouchDrop],
  );

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!onTouchDrop || !touchPayloadRef.current) {
        touchPayloadRef.current = null;
        return;
      }

      const dropTarget = getDropTargetFromTouchEvent(event.nativeEvent);
      if (dropTarget) {
        onTouchDrop(touchPayloadRef.current, dropTarget);
        event.preventDefault();
      }

      touchPayloadRef.current = null;
    },
    [onTouchDrop],
  );

  const handleTouchCancel = useCallback(() => {
    touchPayloadRef.current = null;
  }, []);

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
            onTouchStart={handleTouchStart(definition)}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
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
