import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useDragContext } from '../state/DragContext';
import type { DragPreview, Point } from '../types/drag';
import styles from '../styles/DragPreviewLayer.module.css';

const EXIT_DURATION_MS = 160;

const DragPreviewLayer = (): JSX.Element | null => {
  const { isDragging, preview, pointerPosition } = useDragContext();
  const [cachedPreview, setCachedPreview] = useState<DragPreview | null>(null);
  const [cachedPointer, setCachedPointer] = useState<Point>({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [transitionState, setTransitionState] = useState<'entering' | 'active' | 'leaving'>('entering');

  useEffect(() => {
    if (preview) {
      setCachedPreview(preview);
    }
  }, [preview]);

  useEffect(() => {
    if (pointerPosition) {
      setCachedPointer(pointerPosition);
    }
  }, [pointerPosition]);

  useEffect(() => {
    if (isDragging && preview) {
      setCachedPreview(preview);
      setIsVisible(true);
      setTransitionState('entering');
      const frame = requestAnimationFrame(() => {
        setTransitionState('active');
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!isDragging && isVisible) {
      setTransitionState('leaving');
      const timeout = window.setTimeout(() => {
        setIsVisible(false);
        setCachedPreview(null);
      }, EXIT_DURATION_MS);
      return () => window.clearTimeout(timeout);
    }

    if (!isDragging) {
      setCachedPreview(null);
    }

    return undefined;
  }, [isDragging, isVisible, preview]);

  const activePreview = useMemo(() => preview ?? cachedPreview, [cachedPreview, preview]);

  if (!isVisible || !activePreview) {
    return null;
  }

  const pointer = pointerPosition ?? cachedPointer;
  const offset = activePreview.offset ?? { x: 0, y: 0 };
  const style: CSSProperties & { '--translate-x': string; '--translate-y': string } = {
    width: `${activePreview.width}px`,
    height: `${activePreview.height}px`,
    '--translate-x': `${pointer.x + offset.x}px`,
    '--translate-y': `${pointer.y + offset.y}px`,
  };

  const transitionClass =
    transitionState === 'entering'
      ? styles.previewEntering
      : transitionState === 'leaving'
      ? styles.previewLeaving
      : styles.previewActive;

  return (
    <div className={styles.layer} aria-hidden="true">
      <div className={`${styles.preview} ${transitionClass}`.trim()} style={style} data-testid="drag-preview">
        {activePreview.render()}
      </div>
    </div>
  );
};

export default DragPreviewLayer;
