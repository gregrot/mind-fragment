import { Fragment, useCallback, useMemo, useRef, type TouchEvent as ReactTouchEvent } from 'react';
import { BLOCK_MAP } from '../blocks/library';
import type { RobotTelemetryData } from '../hooks/useRobotTelemetry';
import type { BlockInstance, DragPayload, DropTarget } from '../types/blocks';
import styles from '../styles/BlockView.module.css';
import { getDropTargetFromTouchEvent } from '../utils/dropTarget';
import DropZone from './DropZone';
import BlockParameterField from './BlockParameterField';
import BlockParameterSignalSelect from './BlockParameterSignalSelect';
import ValueInputDropZone from './ValueInputDropZone';

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
  telemetry?: RobotTelemetryData;
}

const BlockView = ({ block, path, onDrop, onTouchDrop, onUpdateBlock, telemetry }: BlockViewProps): JSX.Element | null => {
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
  const slotNames = definition.slots ?? [];
  const expressionInputNames = useMemo(() => new Set(definition.expressionInputs ?? []), [
    definition.expressionInputs,
  ]);
  const hasNestedBlocks = slotNames.length > 0;

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
    case 'value':
      blockClassNames.push(styles.blockValue);
      break;
    case 'operator':
      blockClassNames.push(styles.blockOperator);
      break;
    default:
      blockClassNames.push(styles.blockAction);
      break;
  }

  const blockClassName = blockClassNames.join(' ');

  const parameterEntries = Object.entries(definition.parameters ?? {});
  const parameterNameSet = new Set(parameterEntries.map(([name]) => name));
  const standaloneExpressionInputs = (definition.expressionInputs ?? []).filter(
    (inputName) => !parameterNameSet.has(inputName),
  );

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
      {parameterEntries.map(([parameterName, parameterDefinition]) => {
        const parameterLabel = formatSlotLabel(parameterName);
        const parameterValue = block.parameters?.[parameterName];
        const expressionBlocks = block.expressionInputs?.[parameterName] ?? [];
        const supportsExpression =
          expressionInputNames.has(parameterName) || parameterDefinition.kind === 'operator';
        const placeholder =
          parameterDefinition.kind === 'operator'
            ? 'Drop operator blocks here'
            : 'Drop value blocks here';

        let editor: JSX.Element | null = null;
        if (parameterDefinition.kind === 'boolean' || parameterDefinition.kind === 'number') {
          editor = (
            <BlockParameterField
              block={block}
              parameterName={parameterName}
              definition={parameterDefinition}
              value={parameterValue}
              label={parameterLabel}
              testId={`block-${definition.id}-parameter-${parameterName}`}
              onUpdateBlock={onUpdateBlock}
            />
          );
        } else if (parameterDefinition.kind === 'string') {
          editor = (
            <BlockParameterField
              block={block}
              parameterName={parameterName}
              definition={parameterDefinition}
              value={parameterValue}
              label={parameterLabel}
              testId={`block-${definition.id}-parameter-${parameterName}`}
              onUpdateBlock={onUpdateBlock}
            />
          );
        } else if (parameterDefinition.kind === 'signal') {
          editor = (
            <BlockParameterSignalSelect
              block={block}
              parameterName={parameterName}
              definition={parameterDefinition}
              value={parameterValue}
              label={parameterLabel}
              testId={`block-${definition.id}-parameter-${parameterName}`}
              onUpdateBlock={onUpdateBlock}
              telemetry={telemetry}
            />
          );
        }

        return (
          <div key={parameterName} className={styles.blockControlRow}>
            <span className={styles.blockControlLabel}>{parameterLabel}</span>
            <div className={styles.blockControlInputs}>
              {editor}
              {supportsExpression ? (
                <ValueInputDropZone
                  owner={block}
                  parameterName={parameterName}
                  blocks={expressionBlocks}
                  path={slotPath}
                  placeholder={placeholder}
                  testId={`block-${definition.id}-parameter-${parameterName}-expression`}
                  onDrop={onDrop}
                  renderBlock={(childBlock) => (
                    <BlockView
                      key={childBlock.instanceId}
                      block={childBlock}
                      path={slotPath}
                      onDrop={onDrop}
                      onTouchDrop={onTouchDrop}
                      onUpdateBlock={onUpdateBlock}
                      telemetry={telemetry}
                    />
                  )}
                />
              ) : null}
            </div>
          </div>
        );
      })}
      {standaloneExpressionInputs.map((inputName) => {
        const label = formatSlotLabel(inputName);
        const expressionBlocks = block.expressionInputs?.[inputName] ?? [];

        return (
          <div key={`expression-${inputName}`} className={styles.blockControlRow}>
            <span className={styles.blockControlLabel}>{label}</span>
            <div className={styles.blockControlInputs}>
              <ValueInputDropZone
                owner={block}
                parameterName={inputName}
                blocks={expressionBlocks}
                path={slotPath}
                placeholder="Drop value blocks here"
                testId={`block-${definition.id}-parameter-${inputName}-expression`}
                onDrop={onDrop}
                renderBlock={(childBlock) => (
                  <BlockView
                    key={childBlock.instanceId}
                    block={childBlock}
                    path={slotPath}
                    onDrop={onDrop}
                    onTouchDrop={onTouchDrop}
                    onUpdateBlock={onUpdateBlock}
                    telemetry={telemetry}
                  />
                )}
              />
            </div>
          </div>
        );
      })}
      {hasNestedBlocks ? (
        <div className={styles.blockSlots}>
          {slotNames.map((slotName) => (
            <SlotView
              key={slotName}
              owner={block}
              slotName={slotName}
              blocks={block.slots?.[slotName] ?? []}
              path={slotPath}
              onDrop={onDrop}
              onTouchDrop={onTouchDrop}
              onUpdateBlock={onUpdateBlock}
              telemetry={telemetry}
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
  telemetry?: RobotTelemetryData;
}

const SlotView = ({ owner, slotName, blocks, path, onDrop, onTouchDrop, onUpdateBlock, telemetry }: SlotViewProps): JSX.Element => {
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
                    telemetry={telemetry}
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
