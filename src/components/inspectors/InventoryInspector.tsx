import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import ModuleIcon from '../ModuleIcon';
import type { InspectorProps } from '../../overlay/inspectorRegistry';
import { useEntityOverlayManager } from '../../state/EntityOverlayManager';
import { useDragContext } from '../../state/DragContext';
import type { SlotSchema } from '../../types/slots';
import type { DragSession, DropValidationResult } from '../../types/drag';
import type { ModuleBlueprint } from '../../simulation/robot/modules/moduleLibrary';
import { MODULE_LIBRARY } from '../../simulation/robot/modules/moduleLibrary';
import styles from '../../styles/InventoryInspector.module.css';
import useEntityPersistenceState from '../../hooks/useEntityPersistenceState';
import describeError from '../../utils/describeError';

const MODULE_BLUEPRINT_MAP = new Map<string, ModuleBlueprint>(
  MODULE_LIBRARY.map((module) => [module.id, module]),
);

const sortSlots = (slots: SlotSchema[]): SlotSchema[] => {
  return [...slots].sort((a, b) => a.index - b.index);
};

const getSlotTargetId = (entityId: InspectorProps['entity']['entityId'], slotId: string): string => {
  return `inventory-slot-${entityId}-${slotId}`;
};

const resolveBlueprint = (itemId: string | null): ModuleBlueprint | null => {
  if (!itemId) {
    return null;
  }
  return MODULE_BLUEPRINT_MAP.get(itemId) ?? null;
};

const isModuleId = (itemId: string | null): boolean => {
  return resolveBlueprint(itemId) !== null;
};

const formatItemId = (itemId: string, blueprint: ModuleBlueprint | null): string => {
  if (blueprint) {
    return blueprint.title;
  }
  const segments = itemId.split(/[./_-]/).filter(Boolean);
  if (segments.length === 0) {
    return 'Unknown item';
  }
  const label = segments[segments.length - 1]!;
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const getStackCount = (slot: SlotSchema): number => {
  if (!slot.occupantId) {
    return 0;
  }
  return slot.stackCount ?? 1;
};

const getInitials = (label: string): string => {
  if (!label) {
    return '?';
  }
  const cleaned = label.replace(/[^\p{L}\p{N}]+/gu, '').toUpperCase();
  if (cleaned.length >= 2) {
    return cleaned.slice(0, 2);
  }
  if (cleaned.length === 1) {
    return cleaned;
  }
  return '??';
};

const describeDropRestriction = (reason?: string): string => {
  switch (reason) {
    case 'slot-locked':
      return 'Slot is locked.';
    case 'different-entity':
      return 'This item belongs to another inventory.';
    case 'unsupported-item':
      return 'This slot does not accept that item.';
    case 'module-required':
      return 'Only modules can be stored here.';
    case 'incompatible-item':
      return 'This item cannot share a slot with the selected item.';
    default:
      return 'Cannot drop here.';
  }
};

interface InventorySlotProps {
  entityId: InspectorProps['entity']['entityId'];
  slot: SlotSchema;
  displayName: string;
  blueprint: ModuleBlueprint | null;
  stackCount: number;
  activeTargetId: string | null;
  validation: DropValidationResult | null;
  isDragging: boolean;
  isKeyboardDragging: boolean;
  isSourceSlot: boolean;
  onStartDrag: (event: ReactPointerEvent<HTMLButtonElement>, slot: SlotSchema) => void;
  onKeyboardStart: (slot: SlotSchema, element: HTMLButtonElement | null) => void;
  onKeyboardNavigate: (slotId: string, direction: 'previous' | 'next') => void;
  onKeyboardDrop: (slotId: string) => void;
  onKeyboardCancel: () => void;
  onKeyboardFocus: (slotId: string) => void;
  onButtonRefChange: (slotId: string, element: HTMLButtonElement | null) => void;
  onDrop: (slotId: string, session: DragSession) => void;
  registerDropTarget: ReturnType<typeof useDragContext>['registerDropTarget'];
  setActiveTarget: ReturnType<typeof useDragContext>['setActiveTarget'];
  validateDrop: (slot: SlotSchema, session: DragSession) => DropValidationResult;
  instructionsId: string;
}

const InventorySlot = ({
  entityId,
  slot,
  displayName,
  blueprint,
  stackCount,
  activeTargetId,
  validation,
  isDragging,
  isKeyboardDragging,
  isSourceSlot,
  onStartDrag,
  onKeyboardStart,
  onKeyboardNavigate,
  onKeyboardDrop,
  onKeyboardCancel,
  onKeyboardFocus,
  onButtonRefChange,
  onDrop,
  registerDropTarget,
  setActiveTarget,
  validateDrop,
  instructionsId,
}: InventorySlotProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const targetId = getSlotTargetId(entityId, slot.id);
  const isEmpty = !slot.occupantId;
  const statusId = `inventory-slot-status-${entityId}-${slot.id}`;

  useEffect(() => {
    const unregister = registerDropTarget({
      id: targetId,
      type: 'inventory-slot',
      metadata: { entityId, slotId: slot.id },
      accepts: (session) => validateDrop(slot, session),
      onDrop: (session) => onDrop(slot.id, session),
      getSnapPosition: () => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) {
          return null;
        }
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        } as const;
      },
    });
    return unregister;
  }, [entityId, onDrop, registerDropTarget, slot, targetId, validateDrop]);

  const dropState = useMemo(() => {
    if (activeTargetId !== targetId) {
      return undefined;
    }
    if (!validation) {
      return undefined;
    }
    return validation.canDrop ? 'active-valid' : 'active-invalid';
  }, [activeTargetId, targetId, validation]);

  const ariaLabel = isEmpty
    ? `Empty inventory slot ${slot.index + 1}`
    : stackCount > 1
    ? `${displayName} (×${stackCount})`
    : displayName;

  const statusMessage = useMemo(() => {
    if (slot.metadata.locked) {
      return 'Slot locked. Items cannot be moved here.';
    }
    if (isKeyboardDragging && isSourceSlot) {
      return 'Carrying this item. Use arrow keys or Tab to choose a slot.';
    }
    if (isDragging && activeTargetId === targetId && validation) {
      return validation.canDrop
        ? 'Press Enter to drop the carried item here.'
        : describeDropRestriction(validation.reason);
    }
    if (isEmpty) {
      return 'Empty slot ready for storage.';
    }
    return 'Press Enter or Space to pick up this item.';
  }, [
    activeTargetId,
    isDragging,
    isEmpty,
    isKeyboardDragging,
    isSourceSlot,
    targetId,
    slot.metadata.locked,
    validation,
  ]);

  const handlePointerEnter = useCallback(() => {
    if (isDragging) {
      setActiveTarget(targetId);
    }
  }, [isDragging, setActiveTarget, targetId]);

  const handlePointerLeave = useCallback(() => {
    if (isDragging && activeTargetId === targetId) {
      setActiveTarget(null);
    }
  }, [activeTargetId, isDragging, setActiveTarget, targetId]);

  const initials = useMemo(() => getInitials(displayName), [displayName]);

  useEffect(() => {
    onButtonRefChange(slot.id, buttonRef.current);
    return () => {
      onButtonRefChange(slot.id, null);
    };
  }, [onButtonRefChange, slot.id]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (event.defaultPrevented) {
        return;
      }

      const key = event.key;
      const isActivationKey = key === 'Enter' || key === ' ' || key === 'Spacebar';
      const isNextKey = key === 'ArrowRight' || key === 'ArrowDown';
      const isPreviousKey = key === 'ArrowLeft' || key === 'ArrowUp';

      if (isActivationKey) {
        event.preventDefault();
        if (isKeyboardDragging) {
          onKeyboardDrop(slot.id);
        } else {
          onKeyboardStart(slot, buttonRef.current);
        }
        return;
      }

      if (isKeyboardDragging && isNextKey) {
        event.preventDefault();
        onKeyboardNavigate(slot.id, 'next');
        return;
      }

      if (isKeyboardDragging && isPreviousKey) {
        event.preventDefault();
        onKeyboardNavigate(slot.id, 'previous');
        return;
      }

      if (isKeyboardDragging && key === 'Escape') {
        event.preventDefault();
        onKeyboardCancel();
      }
    },
    [isKeyboardDragging, onKeyboardCancel, onKeyboardDrop, onKeyboardNavigate, onKeyboardStart, slot],
  );

  return (
    <div
      ref={containerRef}
      className={styles.slot}
      data-drop-state={dropState}
      data-slot-locked={slot.metadata.locked ? 'true' : undefined}
      data-testid={`inventory-slot-${slot.id}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <p className={styles.slotLabel}>{`Slot ${slot.index + 1}`}</p>
      <button
        type="button"
        className={styles.itemButton}
        ref={buttonRef}
        onPointerDown={(event) => onStartDrag(event, slot)}
        aria-label={ariaLabel}
        aria-describedby={[statusId, instructionsId].join(' ')}
        aria-grabbed={isSourceSlot ? 'true' : undefined}
        onKeyDown={handleKeyDown}
        onFocus={() => onKeyboardFocus(slot.id)}
        aria-disabled={slot.metadata.locked ? 'true' : undefined}
      >
        <div className={styles.itemVisual}>
          {blueprint ? (
            <ModuleIcon variant={blueprint.icon} />
          ) : isEmpty ? (
            <span className={styles.emptyGlyph}>＋</span>
          ) : (
            <span className={styles.placeholderIcon}>{initials}</span>
          )}
          {stackCount > 1 ? <span className={styles.stackBadge}>{`×${stackCount}`}</span> : null}
        </div>
        {isEmpty ? (
          <span className={styles.emptyLabel}>Empty slot</span>
        ) : (
          <span className={styles.itemName}>{displayName}</span>
        )}
      </button>
      <span id={statusId} className={styles.visuallyHidden} aria-live="polite">
        {statusMessage}
      </span>
    </div>
  );
};

const InventoryInspector = ({ entity }: InspectorProps): JSX.Element => {
  const manager = useEntityOverlayManager();
  const {
    registerDropTarget,
    setActiveTarget,
    activeTargetId,
    validation,
    isDragging,
    session,
    startDrag,
    updatePointer,
    drop,
    cancelDrag,
  } = useDragContext();

  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const initialSlots = useMemo(() => sortSlots(entity.inventory?.slots ?? []), [entity.inventory?.slots]);
  const [slots, setSlots] = useState<SlotSchema[]>(initialSlots);
  const [keyboardDragState, setKeyboardDragState] = useState<{
    sourceSlotId: string;
    targetIndex: number;
  } | null>(null);
  const instructionsId = useId();

  const persistenceState = useEntityPersistenceState(entity.entityId);
  const hasError = persistenceState.status === 'error';
  const errorMessage = hasError
    ? describeError(persistenceState.error, 'An unexpected error occurred.')
    : null;

  useEffect(() => {
    setSlots(sortSlots(entity.inventory?.slots ?? []));
  }, [entity.inventory?.slots]);

  useEffect(() => {
    return () => {
      pointerCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!isDragging) {
      setKeyboardDragState(null);
    }
  }, [isDragging]);

  const validateDrop = useCallback(
    (slot: SlotSchema, session: DragSession): DropValidationResult => {
      if (slot.metadata.locked && session.source.slotId !== slot.id) {
        return { canDrop: false, reason: 'slot-locked' };
      }
      if (session.payload.itemType !== 'inventory-item' && session.payload.itemType !== 'module') {
        return { canDrop: false, reason: 'unsupported-item' };
      }
      if (session.source.entityId && session.source.entityId !== entity.entityId) {
        return { canDrop: false, reason: 'different-entity' };
      }
      if (session.source.type === 'inventory-slot') {
        return { canDrop: true };
      }
      if (session.source.type === 'chassis-slot') {
        if (!isModuleId(session.payload.id)) {
          return { canDrop: false, reason: 'module-required' };
        }
        if (slot.occupantId && !isModuleId(slot.occupantId)) {
          return { canDrop: false, reason: 'incompatible-item' };
        }
        return { canDrop: true };
      }
      return { canDrop: true };
    },
    [entity.entityId],
  );

  const handleDropOnSlot = useCallback(
    (targetSlotId: string, session: DragSession) => {
      const latestEntity = manager.getEntityData(entity.entityId) ?? entity;
      const inventory = latestEntity.inventory;
      if (!inventory) {
        return;
      }

      const nextInventorySlots = inventory.slots.map((slot) => ({ ...slot }));
      const targetIndex = nextInventorySlots.findIndex((slot) => slot.id === targetSlotId);
      if (targetIndex === -1) {
        return;
      }

      const targetSlot = nextInventorySlots[targetIndex]!;
      let updatedChassisSlots: SlotSchema[] | undefined;

      if (session.source.type === 'inventory-slot' && session.source.slotId) {
        const sourceIndex = nextInventorySlots.findIndex((slot) => slot.id === session.source.slotId);
        if (sourceIndex === -1 || sourceIndex === targetIndex) {
          return;
        }

        const sourceSlot = nextInventorySlots[sourceIndex]!;
        if (!sourceSlot.occupantId) {
          return;
        }

        const sourceCount = getStackCount(sourceSlot);
        const targetCount = getStackCount(targetSlot);
        const canMerge =
          targetSlot.metadata.stackable &&
          sourceSlot.metadata.stackable &&
          targetSlot.occupantId &&
          targetSlot.occupantId === sourceSlot.occupantId;

        if (canMerge) {
          nextInventorySlots[sourceIndex] = { ...sourceSlot, occupantId: null, stackCount: undefined };
          nextInventorySlots[targetIndex] = {
            ...targetSlot,
            occupantId: targetSlot.occupantId,
            stackCount: targetCount + sourceCount > 1 ? targetCount + sourceCount : undefined,
          };
        } else {
          nextInventorySlots[sourceIndex] = {
            ...sourceSlot,
            occupantId: targetSlot.occupantId,
            stackCount: targetSlot.stackCount,
          };
          nextInventorySlots[targetIndex] = {
            ...targetSlot,
            occupantId: sourceSlot.occupantId,
            stackCount: sourceSlot.stackCount,
          };
        }
      } else if (session.source.type === 'chassis-slot' && session.source.slotId) {
        const chassis = latestEntity.chassis;
        if (!chassis) {
          return;
        }

        const chassisSlots = chassis.slots.map((slot) => ({ ...slot }));
        const sourceIndex = chassisSlots.findIndex((slot) => slot.id === session.source.slotId);
        if (sourceIndex === -1) {
          return;
        }

        const sourceSlot = chassisSlots[sourceIndex]!;
        if (!sourceSlot.occupantId) {
          return;
        }

        const outgoingId = targetSlot.occupantId;

        chassisSlots[sourceIndex] = { ...sourceSlot, occupantId: outgoingId ?? null };
        nextInventorySlots[targetIndex] = {
          ...targetSlot,
          occupantId: session.payload.id,
          stackCount: session.payload.stackCount && session.payload.stackCount > 1 ? session.payload.stackCount : undefined,
        };

        updatedChassisSlots = chassisSlots;
      } else {
        const incomingId = session.payload.id;
        const incomingCount = session.payload.stackCount ?? 1;

        if (targetSlot.metadata.stackable && targetSlot.occupantId === incomingId) {
          const total = getStackCount(targetSlot) + Math.max(incomingCount, 0);
          nextInventorySlots[targetIndex] = {
            ...targetSlot,
            stackCount: total > 1 ? total : undefined,
          };
        } else {
          nextInventorySlots[targetIndex] = {
            ...targetSlot,
            occupantId: incomingId,
            stackCount: incomingCount > 1 ? incomingCount : undefined,
          };
        }
      }

      const sortedInventory = sortSlots(nextInventorySlots);
      setSlots(sortedInventory);

      const updatedEntity = {
        ...latestEntity,
        inventory: { capacity: inventory.capacity, slots: sortedInventory },
      };

      if (updatedChassisSlots && latestEntity.chassis) {
        const sortedChassis = sortSlots(updatedChassisSlots);
        updatedEntity.chassis = {
          capacity: latestEntity.chassis.capacity,
          slots: sortedChassis,
        };
      }

      Promise.resolve().then(() => {
        manager.upsertEntityData(updatedEntity);
      });
    },
    [entity, manager],
  );

  const createPreview = useCallback((label: string, blueprint: ModuleBlueprint | null) => {
    return {
      render: () => (
        <div className={styles.preview}>
          {blueprint ? (
            <ModuleIcon variant={blueprint.icon} />
          ) : (
            <span className={styles.previewAvatar}>{getInitials(label)}</span>
          )}
          <span className={styles.previewName}>{label}</span>
        </div>
      ),
      width: 120,
      height: 120,
      offset: { x: -60, y: -60 },
    } as const;
  }, []);

  const handleStartDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, slot: SlotSchema) => {
      if (event.button !== 0) {
        return;
      }
      if (!slot.occupantId) {
        return;
      }
      if (slot.metadata.locked) {
        return;
      }

      event.preventDefault();

      const blueprint = resolveBlueprint(slot.occupantId);
      const label = formatItemId(slot.occupantId, blueprint);
      const preview = createPreview(label, blueprint);
      const pointer = { x: event.clientX, y: event.clientY } as const;
      const stackCount = getStackCount(slot);

      startDrag(
        {
          source: {
            type: 'inventory-slot',
            id: slot.id,
            entityId: entity.entityId,
            slotId: slot.id,
            metadata: { slotIndex: slot.index },
          },
          payload: {
            id: slot.occupantId,
            itemType: 'inventory-item',
            stackCount,
            metadata: { source: 'inventory' },
          },
          preview,
        },
        { pointer },
      );

      pointerCleanupRef.current?.();

      const handleMove = (moveEvent: PointerEvent) => {
        updatePointer({ x: moveEvent.clientX, y: moveEvent.clientY });
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
        pointerCleanupRef.current = null;
      };

      const handleUp = (upEvent: PointerEvent) => {
        updatePointer({ x: upEvent.clientX, y: upEvent.clientY });
        drop();
        cleanup();
      };

      const handleCancel = () => {
        cancelDrag('pointer-cancelled');
        cleanup();
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp, { once: true });
      window.addEventListener('pointercancel', handleCancel, { once: true });

      pointerCleanupRef.current = cleanup;
      setKeyboardDragState(null);
    },
    [cancelDrag, createPreview, drop, entity.entityId, startDrag, updatePointer],
  );

  const computeElementCenter = useCallback((element: HTMLButtonElement | null) => {
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } as const;
  }, []);

  const slotTargetIds = useMemo(
    () => slots.map((slot) => getSlotTargetId(entity.entityId, slot.id)),
    [entity.entityId, slots],
  );

  const focusSlotButton = useCallback((slotId: string) => {
    const button = buttonRefs.current.get(slotId);
    button?.focus();
  }, []);

  const scheduleActiveTarget = useCallback(
    (targetId: string) => {
      Promise.resolve().then(() => {
        setActiveTarget(targetId);
      });
    },
    [setActiveTarget],
  );

  const handleKeyboardStart = useCallback(
    (slot: SlotSchema, element: HTMLButtonElement | null) => {
      if (!slot.occupantId) {
        return;
      }
      if (slot.metadata.locked) {
        return;
      }

      const blueprint = resolveBlueprint(slot.occupantId);
      const label = formatItemId(slot.occupantId, blueprint);
      const preview = createPreview(label, blueprint);
      const pointer = computeElementCenter(element);
      const stackCount = getStackCount(slot);

      startDrag(
        {
          source: {
            type: 'inventory-slot',
            id: slot.id,
            entityId: entity.entityId,
            slotId: slot.id,
            metadata: { slotIndex: slot.index },
          },
          payload: {
            id: slot.occupantId,
            itemType: 'inventory-item',
            stackCount,
            metadata: { source: 'inventory' },
          },
          preview,
        },
        pointer ? { pointer } : undefined,
      );

      const targetId = getSlotTargetId(entity.entityId, slot.id);
      scheduleActiveTarget(targetId);

      const index = slots.findIndex((candidate) => candidate.id === slot.id);
      setKeyboardDragState({ sourceSlotId: slot.id, targetIndex: index === -1 ? 0 : index });
    },
    [computeElementCenter, createPreview, entity.entityId, scheduleActiveTarget, slots, startDrag],
  );

  const moveKeyboardTarget = useCallback(
    (currentSlotId: string, direction: 'previous' | 'next') => {
      setKeyboardDragState((state) => {
        if (!state || slotTargetIds.length === 0) {
          return state;
        }

        const delta = direction === 'next' ? 1 : -1;
        const currentIndex = slots.findIndex((slot) => slot.id === currentSlotId);
        const fallbackIndex = state.targetIndex;
        const baseIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
        const nextIndex = (baseIndex + delta + slotTargetIds.length) % slotTargetIds.length;
        const nextSlot = slots[nextIndex]!;
        const targetId = slotTargetIds[nextIndex]!;
        scheduleActiveTarget(targetId);
        focusSlotButton(nextSlot.id);
        return { ...state, targetIndex: nextIndex };
      });
    },
    [focusSlotButton, scheduleActiveTarget, slotTargetIds, slots],
  );

  const handleKeyboardDrop = useCallback(
    (slotId: string) => {
      const targetId = getSlotTargetId(entity.entityId, slotId);
      drop(targetId);
      setKeyboardDragState(null);
      focusSlotButton(slotId);
    },
    [drop, entity.entityId, focusSlotButton],
  );

  const handleKeyboardCancel = useCallback(() => {
    cancelDrag('keyboard-cancelled');
    setKeyboardDragState(null);
  }, [cancelDrag]);

  const handleKeyboardFocus = useCallback(
    (slotId: string) => {
      setKeyboardDragState((state) => {
        if (!state) {
          return state;
        }
        const index = slots.findIndex((slot) => slot.id === slotId);
        if (index === -1) {
          return state;
        }
        const targetId = slotTargetIds[index]!;
        scheduleActiveTarget(targetId);
        return { ...state, targetIndex: index };
      });
    },
    [scheduleActiveTarget, slotTargetIds, slots],
  );

  const registerButtonRef = useCallback((slotId: string, element: HTMLButtonElement | null) => {
    if (element) {
      buttonRefs.current.set(slotId, element);
    } else {
      buttonRefs.current.delete(slotId);
    }
  }, []);

  const handleRetrySave = useCallback(() => {
    manager.retryPersistence(entity.entityId);
  }, [entity.entityId, manager]);

  if (!entity.inventory) {
    return (
      <section className={styles.inspector} aria-label="Inventory inspector">
        <p className={styles.placeholder}>Inventory data is not available for this entity.</p>
      </section>
    );
  }

  return (
    <section className={styles.inspector} aria-label="Inventory inspector" data-testid="inventory-inspector">
      <header className={styles.header}>
        <h3 className={styles.title}>Inventory Management</h3>
        <p className={styles.summary}>Organise stored resources and spare modules for deployment.</p>
        <p id={instructionsId} className={styles.instructions}>
          Keyboard: Press Space or Enter to pick up an item, use arrow keys or Tab to choose a slot, then press Enter to drop.
          Press Escape to cancel.
        </p>
      </header>
      {hasError ? (
        <div className={styles.persistenceError} role="alert" data-testid="inventory-persistence-error">
          <div className={styles.persistenceErrorMessage}>
            <p className={styles.persistenceErrorTitle}>Changes could not be saved.</p>
            <p className={styles.persistenceErrorDetails}>{errorMessage}</p>
          </div>
          <button type="button" className={styles.persistenceRetry} onClick={handleRetrySave}>
            Retry save
          </button>
        </div>
      ) : null}
      <div className={styles.grid}>
        {slots.map((slot) => {
          const blueprint = resolveBlueprint(slot.occupantId);
          const displayName = slot.occupantId ? formatItemId(slot.occupantId, blueprint) : 'Empty slot';
          const stackCount = getStackCount(slot);
          const isSourceSlot =
            isDragging && session?.source.type === 'inventory-slot' && session.source.slotId === slot.id;
          return (
            <InventorySlot
              key={slot.id}
              entityId={entity.entityId}
              slot={slot}
              displayName={displayName}
              blueprint={blueprint}
              stackCount={stackCount}
              activeTargetId={activeTargetId}
              validation={validation}
              isDragging={isDragging}
              isKeyboardDragging={keyboardDragState !== null}
              isSourceSlot={isSourceSlot}
              onStartDrag={handleStartDrag}
              onKeyboardStart={handleKeyboardStart}
              onKeyboardNavigate={moveKeyboardTarget}
              onKeyboardDrop={handleKeyboardDrop}
              onKeyboardCancel={handleKeyboardCancel}
              onKeyboardFocus={handleKeyboardFocus}
              onButtonRefChange={registerButtonRef}
              onDrop={handleDropOnSlot}
              registerDropTarget={registerDropTarget}
              setActiveTarget={setActiveTarget}
              validateDrop={validateDrop}
              instructionsId={instructionsId}
            />
          );
        })}
      </div>
    </section>
  );
};

export default InventoryInspector;
