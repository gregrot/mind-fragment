import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import type { BlockDefinition, DragPayload, DropTarget } from '../types/blocks';
import { getDropTargetFromTouchEvent } from '../utils/dropTarget';
import styles from '../styles/BlockPalette.module.css';

const PAYLOAD_MIME = 'application/json';

const CATEGORY_GROUP_LABELS: Record<string, string> = {
  event: 'Events',
  action: 'Actions',
  c: 'Control',
  value: 'Values & Signals',
  operator: 'Operators',
};

const getGroupLabel = (definition: BlockDefinition): string =>
  definition.paletteGroup ?? CATEGORY_GROUP_LABELS[definition.category] ?? 'Other';

const getBadgeLabel = (definition: BlockDefinition): string | null => {
  switch (definition.category) {
    case 'value':
      return 'Value';
    case 'operator':
      return 'Operator';
    default:
      return null;
  }
};

export interface PaletteBlockEntry {
  definition: BlockDefinition;
  isLocked?: boolean;
  lockMessage?: string;
}

interface BlockPaletteProps {
  blocks: PaletteBlockEntry[];
  onTouchDrop?: (payload: DragPayload, target: DropTarget) => void;
}

interface PaletteGroup {
  key: string;
  label: string;
  blocks: PaletteBlockEntry[];
}

const BlockPalette = ({ blocks, onTouchDrop }: BlockPaletteProps): JSX.Element => {
  const [activeSummaryId, setActiveSummaryId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const touchPayloadRef = useRef<DragPayload | null>(null);

  const { groups, filteredBlockIds } = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    const groupsList: PaletteGroup[] = [];
    const groupMap = new Map<string, PaletteGroup>();
    const blockIds = new Set<string>();

    blocks.forEach((entry) => {
      const { definition } = entry;
      const searchableParts = [
        definition.label,
        definition.summary ?? '',
        ...(definition.paletteTags ?? []),
      ];

      const matches =
        query.length === 0
        || searchableParts.some((part) => part.toLowerCase().includes(query));

      if (!matches) {
        return;
      }

      const groupLabel = getGroupLabel(definition);
      let group = groupMap.get(groupLabel);
      if (!group) {
        group = { key: groupLabel, label: groupLabel, blocks: [] };
        groupMap.set(groupLabel, group);
        groupsList.push(group);
      }

      group.blocks.push(entry);
      blockIds.add(definition.id);
    });

    return { groups: groupsList, filteredBlockIds: blockIds };
  }, [blocks, filterQuery]);

  const handleFilterChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setFilterQuery(event.target.value);
  }, []);

  const handleDragStart = useCallback((definition: BlockDefinition) => (event: DragEvent<HTMLDivElement>) => {
    const payload = {
      source: 'palette',
      blockType: definition.id,
    };

    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.dropEffect = 'copy';
    event.dataTransfer.setData(PAYLOAD_MIME, JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', definition.label);
  }, []);

  const handleTouchStart = useCallback(
    (definition: BlockDefinition) => (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!onTouchDrop) {
        return;
      }

      touchPayloadRef.current = { source: 'palette', blockType: definition.id };
      event.stopPropagation();
    },
    [onTouchDrop],
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

  useEffect(() => {
    if (activeSummaryId && !filteredBlockIds.has(activeSummaryId)) {
      setActiveSummaryId(null);
    }
  }, [activeSummaryId, filteredBlockIds]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      if (!paletteRef.current) {
        return;
      }

      if (paletteRef.current.contains(event.target as Node)) {
        return;
      }

      setActiveSummaryId(null);
    };

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const handlePaletteItemClick = useCallback((definitionId: string) => () => {
    setActiveSummaryId(definitionId);
  }, []);

  const handlePaletteItemMouseLeave = useCallback((definitionId: string) => () => {
    setActiveSummaryId((current) => (current === definitionId ? null : current));
  }, []);

  const handlePaletteItemBlur = useCallback((definitionId: string) => () => {
    setActiveSummaryId((current) => (current === definitionId ? null : current));
  }, []);

  const trimmedFilter = filterQuery.trim();
  const hasFilter = trimmedFilter.length > 0;

  return (
    <div className={styles.paletteWrapper} ref={paletteRef}>
      <div className={styles.paletteControls}>
        <input
          type="search"
          className={styles.paletteFilter}
          placeholder="Search blocks"
          aria-label="Filter blocks"
          value={filterQuery}
          onChange={handleFilterChange}
        />
      </div>
      <div className={styles.blockPalette} role="list" data-testid="block-palette-list">
        {groups.length === 0 ? (
          <div className={styles.paletteEmptyState} role="status">
            No blocks match{hasFilter ? ` “${trimmedFilter}”` : ''}.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className={styles.paletteGroup} role="group" aria-label={group.label}>
              <header className={styles.paletteGroupHeader}>{group.label}</header>
              {group.blocks.map((entry) => {
                const { definition, isLocked = false, lockMessage } = entry;
                const paletteItemClasses = [styles.paletteItem];
                switch (definition.category) {
                  case 'action':
                    paletteItemClasses.push(styles.paletteItemAction);
                    break;
                  case 'c':
                    paletteItemClasses.push(styles.paletteItemC);
                    break;
                  case 'event':
                    paletteItemClasses.push(styles.paletteItemEvent);
                    break;
                  case 'value':
                    paletteItemClasses.push(styles.paletteItemValue);
                    break;
                  case 'operator':
                    paletteItemClasses.push(styles.paletteItemOperator);
                    break;
                  default:
                    paletteItemClasses.push(styles.paletteItemAction);
                    break;
                }
                if (definition.summary && activeSummaryId === definition.id) {
                  paletteItemClasses.push(styles.paletteItemActive);
                }
                if (isLocked) {
                  paletteItemClasses.push(styles.paletteItemLocked);
                }

                const paletteItemClass = paletteItemClasses.join(' ');
                const isSummaryActive = Boolean(definition.summary && activeSummaryId === definition.id);
                const badgeLabel = getBadgeLabel(definition);
                const lockMessageId = isLocked && lockMessage ? `palette-lock-${definition.id}` : undefined;
                const ariaLabel = isLocked && lockMessage ? `${definition.label}. ${lockMessage}` : undefined;

                return (
                  <div
                    key={definition.id}
                    role="listitem"
                    className={paletteItemClass}
                    draggable={!isLocked}
                    aria-disabled={isLocked ? 'true' : undefined}
                    aria-label={ariaLabel}
                    aria-describedby={lockMessageId}
                    data-locked={isLocked ? 'true' : undefined}
                    onDragStart={!isLocked ? handleDragStart(definition) : undefined}
                    onTouchStart={!isLocked ? handleTouchStart(definition) : undefined}
                    onTouchMove={!isLocked ? handleTouchMove : undefined}
                    onTouchEnd={!isLocked ? handleTouchEnd : undefined}
                    onTouchCancel={!isLocked ? handleTouchCancel : undefined}
                    onClick={handlePaletteItemClick(definition.id)}
                    onFocus={handlePaletteItemClick(definition.id)}
                    onMouseLeave={handlePaletteItemMouseLeave(definition.id)}
                    onBlur={handlePaletteItemBlur(definition.id)}
                    tabIndex={0}
                    data-testid={`palette-${definition.id}`}
                    title={isLocked && lockMessage ? lockMessage : undefined}
                  >
                    <div className={styles.paletteHeaderRow}>
                      <span className={styles.paletteLabel}>{definition.label}</span>
                      {badgeLabel ? <span className={styles.paletteBadge}>{badgeLabel}</span> : null}
                    </div>
                    {definition.summary ? (
                      <small
                        className={`${styles.paletteSummary} ${
                          isSummaryActive ? styles.paletteSummaryVisible : ''
                        }`}
                        aria-hidden={isSummaryActive ? false : true}
                      >
                        {definition.summary}
                      </small>
                    ) : null}
                    {isLocked && lockMessage ? (
                      <small id={lockMessageId} className={styles.paletteLockMessage}>
                        {lockMessage}
                      </small>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BlockPalette;
