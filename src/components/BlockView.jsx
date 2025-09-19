import React, { useCallback } from 'react';
import { BLOCK_MAP } from '../blocks/library.js';

const PAYLOAD_MIME = 'application/json';

function BlockView({ block, path, onDrop }) {
  const definition = BLOCK_MAP[block.type];
  if (!definition) {
    return null;
  }

  const handleDragStart = useCallback(
    (event) => {
      const payload = {
        source: 'workspace',
        instanceId: block.instanceId
      };

      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.dropEffect = 'move';
      event.dataTransfer.setData(PAYLOAD_MIME, JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', definition.label);
    },
    [block.instanceId, definition?.label]
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
}

function SlotView({ owner, slotName, blocks, path, onDrop }) {
  const handleDrop = useCallback(
    (event) => {
      onDrop(event, {
        kind: 'slot',
        ownerId: owner.instanceId,
        slotName,
        position: blocks.length,
        ancestorIds: path
      });
    },
    [blocks.length, onDrop, owner.instanceId, path, slotName]
  );

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <section className="block-slot" data-testid={`slot-${slotName}`}>
      <header className="slot-label">{slotName.toUpperCase()}</header>
      <div
        className="slot-body"
        data-testid={`slot-${slotName}-dropzone`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {blocks.length === 0 ? (
          <div className="slot-placeholder">Drop blocks here</div>
        ) : null}
        {blocks.map((childBlock) => (
          <BlockView
            key={childBlock.instanceId}
            block={childBlock}
            path={path}
            onDrop={onDrop}
          />
        ))}
      </div>
    </section>
  );
}

export default BlockView;
