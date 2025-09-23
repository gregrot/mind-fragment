import { Fragment, useCallback, type MouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import type { BlockInstance, DropTarget } from '../types/blocks';
import DropZone from './DropZone';
import styles from '../styles/BlockView.module.css';

interface ValueInputDropZoneProps {
  owner: BlockInstance;
  parameterName: string;
  blocks: BlockInstance[];
  path: string[];
  placeholder?: string;
  testId: string;
  onDrop: (event: React.DragEvent<HTMLElement>, target: DropTarget) => void;
  renderBlock: (block: BlockInstance) => JSX.Element;
}

const ValueInputDropZone = ({
  owner,
  parameterName,
  blocks,
  path,
  placeholder = 'Drop value blocks here',
  testId,
  onDrop,
  renderBlock,
}: ValueInputDropZoneProps): JSX.Element => {
  const stopPropagation = useCallback((event: MouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  const createTarget = useCallback(
    (position: number): DropTarget => ({
      kind: 'parameter-expression',
      ownerId: owner.instanceId,
      parameterName,
      position,
      ancestorIds: path,
    }),
    [owner.instanceId, parameterName, path],
  );

  return (
    <div
      className={styles.valueInputContainer}
      data-testid={testId}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
    >
      {blocks.length === 0 ? (
        <DropZone
          className={styles.valueInputDropZoneEmpty}
          target={createTarget(0)}
          onDrop={onDrop}
          testId={`${testId}-dropzone`}
        >
          <span className={styles.valueInputPlaceholder}>{placeholder}</span>
        </DropZone>
      ) : (
        <div className={styles.valueInputFilled}>
          <DropZone
            className={`${styles.valueInputDropTarget} ${styles.valueInputDropTargetLeading}`}
            target={createTarget(0)}
            onDrop={onDrop}
            testId={`${testId}-dropzone`}
          />
          {blocks.map((childBlock, index) => {
            const trailingClassName =
              index === blocks.length - 1 ? styles.valueInputDropTargetTrailing : undefined;
            const dropClassName = [styles.valueInputDropTarget, trailingClassName].filter(Boolean).join(' ');

            return (
              <Fragment key={childBlock.instanceId}>
                {renderBlock(childBlock)}
                <DropZone
                  className={dropClassName}
                  target={createTarget(index + 1)}
                  onDrop={onDrop}
                />
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ValueInputDropZone;
