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
import type { DragSession, DropValidationResult } from '../../types/drag';
import type { SlotSchema } from '../../types/slots';
import type { ModuleBlueprint } from '../../simulation/mechanism/modules/moduleLibrary';
import { MODULE_LIBRARY } from '../../simulation/mechanism/modules/moduleLibrary';
import styles from '../../styles/ChassisInspector.module.css';
import useEntityPersistenceState from '../../hooks/useEntityPersistenceState';
import describeError from '../../utils/describeError';

const MODULE_BLUEPRINT_MAP = new Map<string, ModuleBlueprint>(
  MODULE_LIBRARY.map((module) => [module.id, module]),
);

const sortSlots = (slots: SlotSchema[]): SlotSchema[] => {
  return [...slots].sort((a, b) => a.index - b.index);
};

const getSlotTargetId = (entityId: InspectorProps['entity']['entityId'], slotId: string): string => {
  return `chassis-slot-${entityId}-${slotId}`;
};

const resolveBlueprint = (moduleId: string | null): ModuleBlueprint | null => {
  if (!moduleId) {
    return null;
  }
  return MODULE_BLUEPRINT_MAP.get(moduleId) ?? null;
};

const isModulePayload = (session: DragSession): boolean => {
  if (session.payload.itemType === 'module') {
    return true;
  }
  if (session.payload.itemType === 'inventory-item') {
    return resolveBlueprint(session.payload.id) !== null;
  }
  return false;
};

const describeSlotType = (slot: SlotSchema): string => {
  if (slot.metadata.locked) {
    return 'Locked slot';
  }
  if (slot.metadata.moduleSubtype) {
    return `${slot.metadata.moduleSubtype} slot`;
  }
  return 'Universal slot';
};

const describeDropRestriction = (reason?: string): string => {
  switch (reason) {
    case 'slot-locked':
      return 'Slot is locked.';
    case 'different-entity':
      return 'This module belongs to another chassis.';
    case 'unsupported-item':
      return 'This slot does not accept that item.';
    case 'module-required':
      return 'Only modules can be placed here.';
    default:
      return 'Cannot drop here.';
  }
};

interface ChassisSlotProps {
  entityId: InspectorProps['entity']['entityId'];
  slot: SlotSchema;
  blueprint: ModuleBlueprint | null;
  hovered: boolean;
  activeTargetId: string | null;
  validation: DropValidationResult | null;
  isDragging: boolean;
  isKeyboardDragging: boolean;
  isSourceSlot: boolean;
  onHoverChange: (slotId: string | null) => void;
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

const ChassisSlot = ({
  entityId,
  slot,
  blueprint,
  hovered,
  activeTargetId,
  validation,
  isDragging,
  isKeyboardDragging,
  isSourceSlot,
  onHoverChange,
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
}: ChassisSlotProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipId = `chassis-slot-tooltip-${entityId}-${slot.id}`;
  const statusId = `chassis-slot-status-${entityId}-${slot.id}`;
  const targetId = getSlotTargetId(entityId, slot.id);

  useEffect(() => {
    const unregister = registerDropTarget({
      id: targetId,
      type: 'chassis-slot',
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

  const slotTypeLabel = describeSlotType(slot);
  const occupantName = blueprint?.title ?? slot.occupantId ?? 'Empty slot';

  const statusMessage = useMemo(() => {
    if (slot.metadata.locked) {
      return 'Slot locked. Modules cannot be moved here.';
    }
    if (!slot.occupantId) {
      if (isDragging && activeTargetId === targetId && validation) {
        return validation.canDrop
          ? 'Empty slot. Press Enter to drop the carried module here.'
          : describeDropRestriction(validation.reason);
      }
      return 'Empty slot ready for modules.';
    }
    if (isKeyboardDragging && isSourceSlot) {
      return 'Carrying this module. Use arrow keys or Tab to choose a slot.';
    }
    if (isDragging && activeTargetId === targetId && validation) {
      return validation.canDrop
        ? 'Press Enter to drop the carried module here.'
        : describeDropRestriction(validation.reason);
    }
    return 'Press Enter or Space to pick up this module.';
  }, [
    activeTargetId,
    isDragging,
    isKeyboardDragging,
    isSourceSlot,
    slot.metadata.locked,
    slot.occupantId,
    targetId,
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
      data-testid={`chassis-slot-${slot.id}`}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      aria-describedby={slot.occupantId ? tooltipId : undefined}
    >
      <p className={styles.slotLabel}>{`Slot ${slot.index + 1}`}</p>
      <p className={styles.slotType}>{slotTypeLabel}</p>
      <button
        type="button"
        className={styles.moduleButton}
        ref={buttonRef}
        onPointerDown={(event) => onStartDrag(event, slot)}
        onMouseEnter={() => onHoverChange(slot.id)}
        onMouseLeave={() => onHoverChange(null)}
        onFocus={() => {
          onHoverChange(slot.id);
          onKeyboardFocus(slot.id);
        }}
        onBlur={() => onHoverChange(null)}
        onKeyDown={handleKeyDown}
        aria-label={occupantName}
        aria-describedby={[statusId, instructionsId, slot.occupantId ? tooltipId : undefined]
          .filter(Boolean)
          .join(' ')}
        aria-grabbed={isSourceSlot ? 'true' : undefined}
        aria-disabled={slot.metadata.locked ? 'true' : undefined}
      >
        {blueprint ? (
          <ModuleIcon variant={blueprint.icon} />
        ) : (
          <span className={styles.emptyLabel}>Add module</span>
        )}
        {slot.occupantId ? <span className={styles.moduleName}>{occupantName}</span> : null}
      </button>
      <span id={statusId} className={styles.visuallyHidden} aria-live="polite">
        {statusMessage}
      </span>
      {hovered && blueprint ? (
        <div role="tooltip" id={tooltipId} className={styles.tooltip}>
          <p className={styles.tooltipTitle}>{blueprint.title}</p>
          <p className={styles.tooltipSummary}>{blueprint.summary}</p>
          <ul className={styles.tooltipStats}>
            <li>{`Provides: ${blueprint.provides.length > 0 ? blueprint.provides.join(', ') : 'None'}`}</li>
            <li>{`Requires: ${blueprint.requires.length > 0 ? blueprint.requires.join(', ') : 'None'}`}</li>
            <li>{`Capacity: ${blueprint.capacityCost}`}</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
};

const ChassisInspector = ({ entity }: InspectorProps): JSX.Element => {
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
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);
  const [keyboardDragState, setKeyboardDragState] = useState<{
    sourceSlotId: string;
    targetIndex: number;
  } | null>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const instructionsId = useId();

  const initialSlots = useMemo(() => sortSlots(entity.chassis?.slots ?? []), [entity.chassis?.slots]);
  const [slots, setSlots] = useState<SlotSchema[]>(initialSlots);

  const persistenceState = useEntityPersistenceState(entity.entityId);
  const hasError = persistenceState.status === 'error';
  const errorMessage = hasError
    ? describeError(persistenceState.error, 'An unexpected error occurred.')
    : null;

  useEffect(() => {
    setSlots(sortSlots(entity.chassis?.slots ?? []));
  }, [entity.chassis?.slots]);

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
      if (session.payload.itemType === 'inventory-item' && resolveBlueprint(session.payload.id) === null) {
        return { canDrop: false, reason: 'module-required' };
      }
      if (!isModulePayload(session)) {
        return { canDrop: false, reason: 'unsupported-item' };
      }
      if (slot.metadata.locked && session.source.slotId !== slot.id) {
        return { canDrop: false, reason: 'slot-locked' };
      }
      if (session.source.entityId && session.source.entityId !== entity.entityId) {
        return { canDrop: false, reason: 'different-entity' };
      }
      if (session.source.type === 'inventory-slot') {
        return { canDrop: true };
      }
      if (slot.metadata.locked) {
        return { canDrop: false, reason: 'slot-locked' };
      }
      return { canDrop: true };
    },
    [entity.entityId],
  );

  const handleDropOnSlot = useCallback(
    (targetSlotId: string, session: DragSession) => {
      const latestEntity = manager.getEntityData(entity.entityId) ?? entity;
      const chassis = latestEntity.chassis;
      if (!chassis) {
        return;
      }

      const nextChassisSlots = chassis.slots.map((slot) => ({ ...slot }));
      const targetIndex = nextChassisSlots.findIndex((slot) => slot.id === targetSlotId);
      if (targetIndex === -1) {
        return;
      }

      const targetSlot = nextChassisSlots[targetIndex]!;
      let updatedInventorySlots: SlotSchema[] | undefined;

      if (session.source.type === 'chassis-slot' && session.source.slotId) {
        const sourceIndex = nextChassisSlots.findIndex((slot) => slot.id === session.source.slotId);
        if (sourceIndex === -1 || sourceIndex === targetIndex) {
          return;
        }

        const sourceSlot = nextChassisSlots[sourceIndex]!;
        const destinationSlot = nextChassisSlots[targetIndex]!;

        nextChassisSlots[sourceIndex] = { ...sourceSlot, occupantId: destinationSlot.occupantId };
        nextChassisSlots[targetIndex] = { ...destinationSlot, occupantId: session.payload.id };
      } else if (session.source.type === 'inventory-slot' && session.source.slotId) {
        const inventory = latestEntity.inventory;
        if (!inventory) {
          return;
        }

        const inventorySlots = inventory.slots.map((slot) => ({ ...slot }));
        const sourceIndex = inventorySlots.findIndex((slot) => slot.id === session.source.slotId);
        if (sourceIndex === -1) {
          return;
        }

        const sourceSlot = inventorySlots[sourceIndex]!;
        if (!sourceSlot.occupantId) {
          return;
        }

        inventorySlots[sourceIndex] = {
          ...sourceSlot,
          occupantId: targetSlot.occupantId ?? null,
          stackCount: undefined,
        };

        nextChassisSlots[targetIndex] = { ...targetSlot, occupantId: session.payload.id };
        updatedInventorySlots = inventorySlots;
      } else {
        if (targetSlot.occupantId === session.payload.id) {
          return;
        }

        nextChassisSlots[targetIndex] = { ...targetSlot, occupantId: session.payload.id };
      }

      const sortedChassis = sortSlots(nextChassisSlots);
      setSlots(sortedChassis);

      const updatedEntity = {
        ...latestEntity,
        chassis: { capacity: chassis.capacity, slots: sortedChassis },
      };

      if (latestEntity.inventory) {
        const nextInventory = updatedInventorySlots
          ? sortSlots(updatedInventorySlots)
          : latestEntity.inventory.slots;
        updatedEntity.inventory = {
          capacity: latestEntity.inventory.capacity,
          slots: nextInventory,
        };
      }

      Promise.resolve().then(() => {
        manager.upsertEntityData(updatedEntity);
      });
    },
    [entity, manager],
  );

  const createPreview = useCallback((blueprint: ModuleBlueprint | null) => {
    if (!blueprint) {
      return undefined;
    }
    return {
      render: () => (
        <div className={styles.preview}>
          <ModuleIcon variant={blueprint.icon} />
          <span className={styles.previewName}>{blueprint.title}</span>
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
      setHoveredSlotId(null);

      const blueprint = resolveBlueprint(slot.occupantId);
      const preview = createPreview(blueprint);
      const pointer = { x: event.clientX, y: event.clientY } as const;

      startDrag(
        {
          source: {
            type: 'chassis-slot',
            id: slot.id,
            entityId: entity.entityId,
            slotId: slot.id,
            metadata: { slotIndex: slot.index },
          },
          payload: {
            id: slot.occupantId,
            itemType: 'module',
            metadata: { source: 'chassis' },
          },
          preview,
          onDropCancel: () => {
            setHoveredSlotId(null);
          },
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

      setHoveredSlotId(null);

      const blueprint = resolveBlueprint(slot.occupantId);
      const preview = createPreview(blueprint);
      const pointer = computeElementCenter(element);

      startDrag(
        {
          source: {
            type: 'chassis-slot',
            id: slot.id,
            entityId: entity.entityId,
            slotId: slot.id,
            metadata: { slotIndex: slot.index },
          },
          payload: {
            id: slot.occupantId,
            itemType: 'module',
            metadata: { source: 'chassis' },
          },
          preview,
          onDropCancel: () => {
            setHoveredSlotId(null);
          },
        },
        pointer ? { pointer } : undefined,
      );

      const targetId = getSlotTargetId(entity.entityId, slot.id);
      scheduleActiveTarget(targetId);

      const index = slots.findIndex((candidate) => candidate.id === slot.id);
      setKeyboardDragState({
        sourceSlotId: slot.id,
        targetIndex: index === -1 ? 0 : index,
      });
    },
    [
      computeElementCenter,
      createPreview,
      entity.entityId,
      scheduleActiveTarget,
      slots,
      startDrag,
      setHoveredSlotId,
    ],
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

  if (!entity.chassis) {
    return (
      <section className={styles.inspector} aria-label="Chassis inspector">
        <p className={styles.placeholder}>Chassis data is not available for this entity.</p>
      </section>
    );
  }

  return (
    <section className={styles.inspector} aria-label="Chassis inspector" data-testid="chassis-inspector">
      <header className={styles.header}>
        <h3 className={styles.title}>Chassis Configuration</h3>
        <p className={styles.summary}>Arrange installed modules and review their capabilities.</p>
        <p id={instructionsId} className={styles.instructions}>
          Keyboard: Press Space or Enter to pick up a module, use arrow keys or Tab to choose a slot, then press Enter to
          drop. Press Escape to cancel.
        </p>
      </header>
      {hasError ? (
        <div className={styles.persistenceError} role="alert" data-testid="chassis-persistence-error">
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
          const isSourceSlot =
            isDragging && session?.source.type === 'chassis-slot' && session.source.slotId === slot.id;
          return (
            <ChassisSlot
              key={slot.id}
              entityId={entity.entityId}
              slot={slot}
              blueprint={blueprint}
              hovered={hoveredSlotId === slot.id}
              activeTargetId={activeTargetId}
              validation={validation}
              isDragging={isDragging}
              isKeyboardDragging={keyboardDragState !== null}
              isSourceSlot={isSourceSlot}
              onHoverChange={setHoveredSlotId}
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

export default ChassisInspector;
