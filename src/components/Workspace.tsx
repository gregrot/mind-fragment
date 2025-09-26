import { Fragment, useCallback } from 'react';
import BlockView from './BlockView';
import DropZone from './DropZone';
import type { MechanismTelemetryData } from '../hooks/useMechanismTelemetry';
import type { BlockInstance, DropTarget, DragPayload } from '../types/blocks';
import styles from '../styles/Workspace.module.css';

interface WorkspaceProps {
  blocks: BlockInstance[];
  onDrop: (event: React.DragEvent<HTMLElement>, target: DropTarget) => void;
  onTouchDrop?: (payload: DragPayload, target: DropTarget) => void;
  onUpdateBlock?: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
  onRemoveBlock: (instanceId: string) => void;
  telemetry?: MechanismTelemetryData;
  activeBlockId?: string | null;
  warningBlockIds?: Set<string>;
}

const Workspace = ({
  blocks,
  onDrop,
  onTouchDrop,
  onUpdateBlock,
  onRemoveBlock,
  telemetry,
  activeBlockId,
  warningBlockIds,
}: WorkspaceProps): JSX.Element => {
  const workspaceTarget = (position: number): DropTarget => ({
    kind: 'workspace',
    position,
    ancestorIds: [],
  });

  const handleContainerDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      onDrop(event, workspaceTarget(blocks.length));
    },
    [blocks.length, onDrop],
  );

  const handleContainerDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div className={styles.workspace} data-testid="workspace">
      <div
        className={styles.workspaceDropzone}
        data-testid="workspace-dropzone"
        data-drop-target-kind="workspace"
        data-drop-target-position={blocks.length}
        data-drop-target-ancestors=""
        onDrop={handleContainerDrop}
        onDragOver={handleContainerDragOver}
      >
        {blocks.length === 0 ? (
          <DropZone className={styles.workspaceDropTargetEmpty} target={workspaceTarget(0)} onDrop={onDrop}>
            <p className={styles.workspaceEmpty}>Drag blocks here to start building</p>
          </DropZone>
        ) : (
          <>
            <DropZone
              className={`${styles.workspaceDropTarget} ${styles.workspaceDropTargetLeading}`}
              target={workspaceTarget(0)}
              onDrop={onDrop}
            />
            {blocks.map((block, index) => {
              const trailingClassName =
                index === blocks.length - 1 ? styles.workspaceDropTargetTrailing : undefined;
              const dropTargetClassName = [styles.workspaceDropTarget, trailingClassName]
                .filter(Boolean)
                .join(' ');

              return (
                <Fragment key={block.instanceId}>
                  <BlockView
                    block={block}
                    path={[]}
                    onDrop={onDrop}
                    onTouchDrop={onTouchDrop}
                    onUpdateBlock={onUpdateBlock}
                    onRemoveBlock={onRemoveBlock}
                    telemetry={telemetry}
                    activeBlockId={activeBlockId}
                    warningBlockIds={warningBlockIds}
                  />
                  <DropZone
                    className={dropTargetClassName}
                    target={workspaceTarget(index + 1)}
                    onDrop={onDrop}
                  />
                </Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default Workspace;
