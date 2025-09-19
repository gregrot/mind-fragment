import { useCallback } from 'react';
import { BLOCK_MAP } from '../blocks/library';
import type { BlockInstance, DropTarget } from '../types/blocks';

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
}

const BlockView = ({ block, path, onDrop }: BlockViewProps): JSX.Element | null => {
  const definition = BLOCK_MAP[block.type];
  if (!definition) {
    return null;
  }

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

  return (
    <div
      className={`block block-${definition.category} block-type-${definition.id}`}
      draggable
      onDragStart={handleDragStart}
      data-testid={`block-${definition.id}`}
    >
      <header className="block-header">
        <span className="block-title">{definition.label}</span>
      </header>
      {definition.summary && definition.category !== 'action' ? (
        <p className="block-summary">{definition.summary}</p>
      ) : null}
      {definition.slots ? (
        <div className="block-slots">
          {definition.slots.map((slotName) => (
            <SlotView
              key={slotName}
              owner={block}
              slotName={slotName}
              blocks={block.slots?.[slotName] ?? []}
              path={slotPath}
              onDrop={onDrop}
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
}

const SlotView = ({ owner, slotName, blocks, path, onDrop }: SlotViewProps): JSX.Element => {
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
    <section className="block-slot" data-testid={`slot-${slotName}`}>
      <header className="slot-label">{slotLabel}</header>
      <div
        className="slot-body"
        data-testid={`slot-${slotName}-dropzone`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {blocks.length === 0 ? <div className="slot-placeholder">Drop blocks here</div> : null}
        {blocks.map((childBlock) => (
          <BlockView key={childBlock.instanceId} block={childBlock} path={path} onDrop={onDrop} />
        ))}
      </div>
    </section>
  );
};

export default BlockView;
