import { Fragment, useCallback, useRef, type MouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { BLOCK_MAP } from '../blocks/library';
import type { BlockInstance, DragPayload, DropTarget } from '../types/blocks';
import styles from '../styles/BlockView.module.css';
import { getDropTargetFromTouchEvent } from '../utils/dropTarget';
import DropZone from './DropZone';

const PAYLOAD_MIME = 'application/json';

const formatSlotLabel = (slotName: string): string =>
  slotName
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toUpperCase();

interface BlockViewProps {
  block: BlockInstance;
  path: string[];
  onDrop: (event: React.DragEvent<HTMLElement>, target: DropTarget) => void;
  onTouchDrop?: (payload: DragPayload, target: DropTarget) => void;
  onUpdateBlock?: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
}

const BlockView = ({ block, path, onDrop, onTouchDrop, onUpdateBlock }: BlockViewProps): JSX.Element | null => {
  const definition = BLOCK_MAP[block.type];
  if (!definition) {
    return null;
  }

  const touchPayloadRef = useRef<DragPayload | null>(null);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const payload = {
        source: 'workspace' as const,
        instanceId: block.instanceId,
      };

      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.dropEffect = 'move';
      event.dataTransfer.setData(PAYLOAD_MIME, JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', definition.label);
    },
    [block.instanceId, definition.label],
  );

  const slotPath = [...path, block.instanceId];

  const blockClassNames = [styles.block, 'block'];
  switch (definition.category) {
    case 'action':
      blockClassNames.push(styles.blockAction);
      break;
    case 'c':
      blockClassNames.push(styles.blockControl);
      break;
    case 'event':
      blockClassNames.push(styles.blockEvent);
      break;
    default:
      blockClassNames.push(styles.blockAction);
      break;
  }

  const blockClassName = blockClassNames.join(' ');

  const statusValue = block.type === 'set-status'
    ? Boolean((block.state as { value?: boolean } | undefined)?.value !== false)
    : null;

  const handleToggleStatusValue = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (!onUpdateBlock) {
        return;
      }
      onUpdateBlock(block.instanceId, (current) => {
        const currentValue = Boolean((current.state as { value?: boolean } | undefined)?.value !== false);
        return {
          ...current,
          state: { ...current.state, value: !currentValue },
        };
      });
    },
    [block.instanceId, onUpdateBlock],
  );

  const handleStatusMouseDown = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  }, []);

  const handleStatusTouchStart = useCallback((event: ReactTouchEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  }, []);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!onTouchDrop) {
        return;
      }

      touchPayloadRef.current = { source: 'workspace', instanceId: block.instanceId };
      event.stopPropagation();
    },
    [block.instanceId, onTouchDrop],
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

  return (
    <div
      className={blockClassName}
      draggable
      onDragStart={handleDragStart}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      data-testid={`block-${definition.id}`}
    >
      <header className={styles.blockHeader}>
        <span className={styles.blockTitle}>{definition.label}</span>
      </header>
      {definition.summary && definition.category !== 'action' ? (
        <p className={styles.blockSummary}>{definition.summary}</p>
      ) : null}
      {block.type === 'set-status' ? (
        <div className={styles.blockControlRow}>
          <span className={styles.blockControlLabel}>Status value</span>
          <button
            type="button"
            className={styles.blockToggle}
            onMouseDown={handleStatusMouseDown}
            onTouchStart={handleStatusTouchStart}
            onClick={handleToggleStatusValue}
            data-testid={`block-${definition.id}-toggle`}
          >
            {statusValue ? 'true' : 'false'}
          </button>
        </div>
      ) : null}
      {definition.slots ? (
        <div className={styles.blockSlots}>
          {definition.slots.map((slotName) => (
            <SlotView
              key={slotName}
              owner={block}
              slotName={slotName}
              blocks={block.slots?.[slotName] ?? []}
              path={slotPath}
              onDrop={onDrop}
              onTouchDrop={onTouchDrop}
              onUpdateBlock={onUpdateBlock}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

interface SlotViewProps {
  owner: BlockInstance;
  slotName: string;
  blocks: BlockInstance[];
  path: string[];
  onDrop: (event: React.DragEvent<HTMLElement>, target: DropTarget) => void;
  onTouchDrop?: (payload: DragPayload, target: DropTarget) => void;
  onUpdateBlock?: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
}

const SlotView = ({ owner, slotName, blocks, path, onDrop, onTouchDrop, onUpdateBlock }: SlotViewProps): JSX.Element => {
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      onDrop(event, {
        kind: 'slot',
        ownerId: owner.instanceId,
        slotName,
        position: blocks.length,
        ancestorIds: path,
      });
    },
    [blocks.length, onDrop, owner.instanceId, path, slotName],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const slotLabel = formatSlotLabel(slotName);

  return (
    <section className={styles.blockSlot} data-testid={`slot-${slotName}`}>
      <header className={styles.slotLabel}>{slotLabel}</header>
      <div
        className={styles.slotBody}
        data-testid={`slot-${slotName}-dropzone`}
        data-drop-target-kind="slot"
        data-drop-target-owner-id={owner.instanceId}
        data-drop-target-slot-name={slotName}
        data-drop-target-position={blocks.length}
        data-drop-target-ancestors={path.join(',')}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {blocks.length === 0 ? (
          <DropZone
            className={styles.slotDropTargetEmpty}
            target={{
              kind: 'slot',
              ownerId: owner.instanceId,
              slotName,
              position: 0,
              ancestorIds: path,
            }}
            onDrop={onDrop}
          >
            <div className={`${styles.slotPlaceholder} slot-placeholder`}>Drop blocks here</div>
          </DropZone>
        ) : (
          <>
            <DropZone
              className={`${styles.slotDropTarget} ${styles.slotDropTargetLeading}`}
              target={{
                kind: 'slot',
                ownerId: owner.instanceId,
                slotName,
                position: 0,
                ancestorIds: path,
              }}
              onDrop={onDrop}
            />
            {blocks.map((childBlock, index) => {
              const trailingClassName =
                index === blocks.length - 1 ? styles.slotDropTargetTrailing : undefined;
              const dropTargetClassName = [styles.slotDropTarget, trailingClassName]
                .filter(Boolean)
                .join(' ');

              return (
                <Fragment key={childBlock.instanceId}>
                  <BlockView
                    block={childBlock}
                    path={path}
                    onDrop={onDrop}
                    onTouchDrop={onTouchDrop}
                    onUpdateBlock={onUpdateBlock}
                  />
                  <DropZone
                    className={dropTargetClassName}
                    target={{
                      kind: 'slot',
                      ownerId: owner.instanceId,
                      slotName,
                      position: index + 1,
                      ancestorIds: path,
                    }}
                    onDrop={onDrop}
                  />
                </Fragment>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
};

export default BlockView;
