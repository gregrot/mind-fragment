import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import type { BlockDefinition, DragPayload, DropTarget } from '../types/blocks';
import { getDropTargetFromTouchEvent } from '../utils/dropTarget';
import styles from '../styles/BlockPalette.module.css';

const PAYLOAD_MIME = 'application/json';

interface BlockPaletteProps {
  blocks: BlockDefinition[];
  onTouchDrop?: (payload: DragPayload, target: DropTarget) => void;
}

const BlockPalette = ({ blocks, onTouchDrop }: BlockPaletteProps): JSX.Element => {
  const [activeSummaryId, setActiveSummaryId] = useState<string | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
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

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!onTouchDrop || !touchPayloadRef.current) {
        return;
      }

      event.preventDefault();
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

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!paletteRef.current) {
        return;
      }

      if (paletteRef.current.contains(event.target as Node)) {
        return;
      }

      setActiveSummaryId(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const handlePaletteItemClick = useCallback((definitionId: string) => () => {
    setActiveSummaryId(definitionId);
  }, []);

  const handlePaletteItemMouseLeave = useCallback((definitionId: string) => () => {
    setActiveSummaryId((current) => (current === definitionId ? null : current));
  }, []);

  const handlePaletteItemBlur = useCallback((definitionId: string) => () => {
    setActiveSummaryId((current) => (current === definitionId ? null : current));
  }, []);

  return (
    <div
      className={styles.blockPalette}
      role="list"
      data-testid="block-palette-list"
      ref={paletteRef}
    >
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
        if (definition.summary && activeSummaryId === definition.id) {
          paletteItemClasses.push(styles.paletteItemActive);
        }

        const paletteItemClass = paletteItemClasses.join(' ');
        const isSummaryActive = Boolean(definition.summary && activeSummaryId === definition.id);
        return (
          <div
            key={definition.id}
            role="listitem"
            className={paletteItemClass}
            draggable
            onDragStart={handleDragStart(definition)}
            onTouchStart={handleTouchStart(definition)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onClick={handlePaletteItemClick(definition.id)}
            onFocus={handlePaletteItemClick(definition.id)}
            onMouseLeave={handlePaletteItemMouseLeave(definition.id)}
            onBlur={handlePaletteItemBlur(definition.id)}
            tabIndex={0}
            data-testid={`palette-${definition.id}`}
          >
            <span className={styles.paletteLabel}>{definition.label}</span>
            {definition.summary ? (
              <small
                className={`${styles.paletteSummary} ${
                  isSummaryActive ? styles.paletteSummaryVisible : ''
                }`}
                aria-hidden={isSummaryActive ? false : true}
              >
                {definition.summary}
              </small>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default BlockPalette;
