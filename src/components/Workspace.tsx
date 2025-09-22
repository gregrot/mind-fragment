import { useCallback } from 'react';
import BlockView from './BlockView';
import type { BlockInstance, DragPayload, DropTarget } from '../types/blocks';
import styles from '../styles/Workspace.module.css';

interface WorkspaceProps {
  blocks: BlockInstance[];
  onDrop: (event: React.DragEvent<HTMLElement>, target: DropTarget) => void;
  onTouchDrop?: (payload: DragPayload, target: DropTarget) => void;
  onUpdateBlock?: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
}

const Workspace = ({ blocks, onDrop, onTouchDrop, onUpdateBlock }: WorkspaceProps): JSX.Element => {
  const handleRootDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      onDrop(event, {
        kind: 'workspace',
        position: blocks.length,
        ancestorIds: [],
      });
    },
    [blocks.length, onDrop],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
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
        onDragOver={handleDragOver}
        onDrop={handleRootDrop}
      >
        {blocks.length === 0 ? <p className={styles.workspaceEmpty}>Drag blocks here to start building</p> : null}
        {blocks.map((block) => (
          <BlockView
            key={block.instanceId}
            block={block}
            path={[]}
            onDrop={onDrop}
            onTouchDrop={onTouchDrop}
            onUpdateBlock={onUpdateBlock}
          />
        ))}
      </div>
    </div>
  );
};

export default Workspace;
