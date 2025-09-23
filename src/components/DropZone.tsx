import { useCallback, useState, type ReactNode } from 'react';
import type { DropTarget } from '../types/blocks';
import styles from '../styles/DropZone.module.css';

interface DropZoneProps {
  className?: string;
  target: DropTarget;
  onDrop: (event: React.DragEvent<HTMLElement>, target: DropTarget) => void;
  children?: ReactNode;
  testId?: string;
}

const joinClassNames = (classNames: Array<string | undefined>): string =>
  classNames.filter(Boolean).join(' ');

const DropZone = ({ className, target, onDrop, children, testId }: DropZoneProps): JSX.Element => {
  const [isActive, setIsActive] = useState(false);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setIsActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsActive(false);
      onDrop(event, target);
    },
    [onDrop, target],
  );

  const classNames = joinClassNames([styles.dropZone, className]);
  const ancestorIds = target.ancestorIds.join(',');

  return (
    <div
      className={classNames}
      data-drop-target-kind={target.kind}
      data-drop-target-position={typeof target.position === 'number' ? String(target.position) : ''}
      data-drop-target-ancestors={ancestorIds}
      data-drop-target-owner-id={
        target.kind === 'slot' || target.kind === 'parameter' || target.kind === 'parameter-expression'
          ? target.ownerId
          : undefined
      }
      data-drop-target-slot-name={target.kind === 'slot' ? target.slotName : undefined}
      data-drop-target-parameter-name={
        target.kind === 'parameter' || target.kind === 'parameter-expression'
          ? target.parameterName
          : undefined
      }
      data-dropzone-active={isActive ? 'true' : undefined}
      data-testid={testId}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}
    </div>
  );
};

export default DropZone;
