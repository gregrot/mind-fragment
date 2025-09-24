import { useDragContext } from '../state/DragContext';
import styles from '../styles/DragPreviewLayer.module.css';

const DragPreviewLayer = (): JSX.Element | null => {
  const { isDragging, preview, pointerPosition } = useDragContext();

  if (!isDragging || !preview) {
    return null;
  }

  const { x: pointerX, y: pointerY } = pointerPosition ?? { x: 0, y: 0 };
  const { x: offsetX, y: offsetY } = preview.offset ?? { x: 0, y: 0 };

  const style = {
    width: `${preview.width}px`,
    height: `${preview.height}px`,
    transform: `translate(${pointerX + offsetX}px, ${pointerY + offsetY}px)`,
  } as const;

  return (
    <div className={styles.layer} aria-hidden="true">
      <div className={styles.preview} style={style} data-testid="drag-preview">
        {preview.render()}
      </div>
    </div>
  );
};

export default DragPreviewLayer;
