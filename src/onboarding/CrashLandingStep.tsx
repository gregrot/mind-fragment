import { type PointerEvent, useCallback, useMemo, useRef, useState } from 'react';
import styles from '../styles/CrashLandingStep.module.css';

interface CrashLandingStepProps {
  onComplete: () => void;
}

interface ReticlePosition {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const createInitialTrail = (position: ReticlePosition): ReticlePosition[] =>
  new Array(12).fill(null).map((_, index) => ({
    x: clamp(position.x - index * 1.5, 0, 100),
    y: clamp(position.y + index * 1.2, 0, 100),
  }));

const CrashLandingStep = ({ onComplete }: CrashLandingStepProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [reticle, setReticle] = useState<ReticlePosition>({ x: 62, y: 38 });
  const [trail, setTrail] = useState<ReticlePosition[]>(() => createInitialTrail({ x: 62, y: 38 }));
  const [draggingPointerId, setDraggingPointerId] = useState<number | null>(null);
  const [hasSteered, setHasSteered] = useState(false);

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const bounds = container.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }

    const relativeX = clamp(((clientX - bounds.left) / bounds.width) * 100, 0, 100);
    const relativeY = clamp(((clientY - bounds.top) / bounds.height) * 100, 0, 100);

    setReticle({ x: relativeX, y: relativeY });
    setTrail((current) => {
      const next = [...current.slice(-14), { x: relativeX, y: relativeY }];
      return next;
    });
    setHasSteered(true);
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.setPointerCapture(event.pointerId);
    setDraggingPointerId(event.pointerId);
    updatePosition(event.clientX, event.clientY);
  }, [updatePosition]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (draggingPointerId === null || event.pointerId !== draggingPointerId) {
        return;
      }
      updatePosition(event.clientX, event.clientY);
    },
    [draggingPointerId, updatePosition],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (draggingPointerId === null || event.pointerId !== draggingPointerId) {
      return;
    }
    const container = containerRef.current;
    container?.releasePointerCapture(event.pointerId);
    setDraggingPointerId(null);
  }, [draggingPointerId]);

  const tailSegments = useMemo(() => trail.slice(0, -1), [trail]);

  return (
    <div className={styles.crashShell}>
      <div className={styles.dialogue}>
        <p className={styles.kicker}>Act 0 — Final Descent</p>
        <h3 className={styles.title}>Steer the crash</h3>
        <p className={styles.copy}>
          Drag the descent marker to nudge our impact site. Rich scrap pockets and calmer terrain await if you guide the skid
          into the valley. Core integrity is already hanging on by threads.
        </p>
      </div>
      <div
        ref={containerRef}
        className={styles.map}
        role="application"
        aria-label="Crash trajectory visualiser"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className={styles.glow} aria-hidden="true" />
        {tailSegments.map((segment, index) => (
          <div
            key={`${segment.x.toFixed(2)}-${segment.y.toFixed(2)}-${index}`}
            className={styles.trail}
            style={{
              left: `${segment.x}%`,
              top: `${segment.y}%`,
              opacity: 0.15 + (index / tailSegments.length) * 0.55,
            }}
            aria-hidden="true"
          />
        ))}
        <div
          className={styles.reticle}
          style={{ left: `${reticle.x}%`, top: `${reticle.y}%` }}
          aria-hidden="true"
        >
          <span className={styles.reticleCore} />
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onComplete} disabled={!hasSteered}>
          Brace for impact
        </button>
        <p className={styles.hint}>Drag anywhere on the map to set the final crash vector.</p>
      </div>
    </div>
  );
};

export default CrashLandingStep;
