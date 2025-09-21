import { useCallback, useMemo, useState } from 'react';
import styles from '../styles/ScrapCollectionStep.module.css';

type ScrapKind = 'capacitor' | 'ferrous';

interface ScrapPiece {
  id: string;
  x: number;
  y: number;
  kind: ScrapKind;
  collected: boolean;
}

interface ScrapCollectionStepProps {
  onComplete: () => void;
}

const SCRAP_LAYOUT: Array<Omit<ScrapPiece, 'collected'>> = [
  { id: 'scrap-a', x: 18, y: 42, kind: 'capacitor' },
  { id: 'scrap-b', x: 64, y: 38, kind: 'ferrous' },
  { id: 'scrap-c', x: 42, y: 68, kind: 'capacitor' },
  { id: 'scrap-d', x: 78, y: 24, kind: 'ferrous' },
  { id: 'scrap-e', x: 30, y: 22, kind: 'capacitor' },
];

const kindLabel: Record<ScrapKind, string> = {
  capacitor: 'capacitor shard',
  ferrous: 'ferrous debris',
};

const ScrapCollectionStep = ({ onComplete }: ScrapCollectionStepProps): JSX.Element => {
  const [scrapPieces, setScrapPieces] = useState<ScrapPiece[]>(() =>
    SCRAP_LAYOUT.map((piece) => ({ ...piece, collected: false })),
  );

  const collectedCount = useMemo(
    () => scrapPieces.filter((piece) => piece.collected).length,
    [scrapPieces],
  );
  const totalPieces = scrapPieces.length;
  const allCollected = collectedCount >= totalPieces;

  const handleCollect = useCallback((id: string) => {
    setScrapPieces((pieces) =>
      pieces.map((piece) => (piece.id === id ? { ...piece, collected: true } : piece)),
    );
  }, []);

  return (
    <div className={styles.scrapShell}>
      <div className={styles.card}>
        <p className={styles.kicker}>Boot Sequence — Restore Power</p>
        <h3 className={styles.title}>Collect nearby scrap</h3>
        <p className={styles.copy}>
          Hover through the wreckage and pull anything conductive back into us. Every shard you snag brings the assembler a
          little closer to life.
        </p>
        <p className={styles.progress}>
          {collectedCount} / {totalPieces} recovered
        </p>
      </div>
      <div className={styles.field}>
        <div className={styles.fieldGlow} aria-hidden="true" />
        {scrapPieces.map((piece) => (
          <button
            key={piece.id}
            type="button"
            className={styles.scrap}
            style={{ left: `${piece.x}%`, top: `${piece.y}%` }}
            onClick={() => handleCollect(piece.id)}
            disabled={piece.collected}
            aria-pressed={piece.collected}
            aria-label={piece.collected ? `${kindLabel[piece.kind]} secured` : `Collect ${kindLabel[piece.kind]}`}
          >
            <span className={styles.scrapCore} data-kind={piece.kind} aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onComplete} disabled={!allCollected}>
          Route power to assembler
        </button>
        <p className={styles.hint}>Tap each shard to pull it within range. We only need a handful to ignite the bay.</p>
      </div>
    </div>
  );
};

export default ScrapCollectionStep;
