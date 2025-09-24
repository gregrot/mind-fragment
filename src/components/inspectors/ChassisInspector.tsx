import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import ModuleIcon from '../ModuleIcon';
import type { InspectorProps } from '../../overlay/inspectorRegistry';
import { useEntityOverlayManager } from '../../state/EntityOverlayManager';
import { useDragContext } from '../../state/DragContext';
import type { DragSession, DropValidationResult } from '../../types/drag';
import type { SlotSchema } from '../../types/slots';
import type { ModuleBlueprint } from '../../simulation/robot/modules/moduleLibrary';
import { MODULE_LIBRARY } from '../../simulation/robot/modules/moduleLibrary';
import styles from '../../styles/ChassisInspector.module.css';

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

const describeSlotType = (slot: SlotSchema): string => {
  if (slot.metadata.locked) {
    return 'Locked slot';
  }
  if (slot.metadata.moduleSubtype) {
    return `${slot.metadata.moduleSubtype} slot`;
  }
  return 'Universal slot';
};

interface ChassisSlotProps {
  entityId: InspectorProps['entity']['entityId'];
  slot: SlotSchema;
  blueprint: ModuleBlueprint | null;
  hovered: boolean;
  activeTargetId: string | null;
  validation: DropValidationResult | null;
  isDragging: boolean;
  onHoverChange: (slotId: string | null) => void;
  onStartDrag: (event: ReactPointerEvent<HTMLButtonElement>, slot: SlotSchema) => void;
  onDrop: (slotId: string, session: DragSession) => void;
  registerDropTarget: ReturnType<typeof useDragContext>['registerDropTarget'];
  setActiveTarget: ReturnType<typeof useDragContext>['setActiveTarget'];
  validateDrop: (slot: SlotSchema, session: DragSession) => DropValidationResult;
}

const ChassisSlot = ({
  entityId,
  slot,
  blueprint,
  hovered,
  activeTargetId,
  validation,
  isDragging,
  onHoverChange,
  onStartDrag,
  onDrop,
  registerDropTarget,
  setActiveTarget,
  validateDrop,
}: ChassisSlotProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = `chassis-slot-tooltip-${entityId}-${slot.id}`;
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
        onPointerDown={(event) => onStartDrag(event, slot)}
        onMouseEnter={() => onHoverChange(slot.id)}
        onMouseLeave={() => onHoverChange(null)}
        onFocus={() => onHoverChange(slot.id)}
        onBlur={() => onHoverChange(null)}
        disabled={!slot.occupantId || slot.metadata.locked}
        aria-label={occupantName}
      >
        {blueprint ? (
          <ModuleIcon variant={blueprint.icon} />
        ) : (
          <span className={styles.emptyLabel}>Add module</span>
        )}
        {slot.occupantId ? <span className={styles.moduleName}>{occupantName}</span> : null}
      </button>
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
    startDrag,
    updatePointer,
    drop,
    cancelDrag,
  } = useDragContext();

  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);

  const initialSlots = useMemo(() => sortSlots(entity.chassis?.slots ?? []), [entity.chassis?.slots]);
  const [slots, setSlots] = useState<SlotSchema[]>(initialSlots);

  useEffect(() => {
    setSlots(sortSlots(entity.chassis?.slots ?? []));
  }, [entity.chassis?.slots]);

  useEffect(() => {
    return () => {
      pointerCleanupRef.current?.();
    };
  }, []);

  const validateDrop = useCallback(
    (slot: SlotSchema, session: DragSession): DropValidationResult => {
      if (session.payload.itemType !== 'module') {
        return { canDrop: false, reason: 'unsupported-item' };
      }
      if (slot.metadata.locked && session.source.slotId !== slot.id) {
        return { canDrop: false, reason: 'slot-locked' };
      }
      if (session.source.type === 'chassis-slot') {
        if (session.source.entityId !== entity.entityId) {
          return { canDrop: false, reason: 'different-entity' };
        }
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
      const chassis = entity.chassis;
      if (!chassis) {
        return;
      }

      setSlots((currentSlots) => {
        const next = currentSlots.map((slot) => ({ ...slot }));
        const targetIndex = next.findIndex((slot) => slot.id === targetSlotId);
        if (targetIndex === -1) {
          return currentSlots;
        }

        const targetSlot = next[targetIndex]!;

        if (session.source.type === 'chassis-slot' && session.source.slotId) {
          const sourceIndex = next.findIndex((slot) => slot.id === session.source.slotId);
          if (sourceIndex === -1) {
            return currentSlots;
          }
          if (sourceIndex === targetIndex) {
            return currentSlots;
          }

          const sourceSlot = next[sourceIndex]!;
          const destinationSlot = next[targetIndex]!;

          next[sourceIndex] = { ...sourceSlot, occupantId: destinationSlot.occupantId };
          next[targetIndex] = { ...destinationSlot, occupantId: session.payload.id };

          const sorted = sortSlots(next);
          const updatedEntity = {
            ...entity,
            chassis: { capacity: chassis.capacity, slots: sorted },
          };
          Promise.resolve().then(() => {
            manager.upsertEntityData(updatedEntity);
          });
          return sorted;
        }

        if (targetSlot.occupantId === session.payload.id) {
          return currentSlots;
        }

        next[targetIndex] = { ...targetSlot, occupantId: session.payload.id };
        const sorted = sortSlots(next);
        const updatedEntity = {
          ...entity,
          chassis: { capacity: chassis.capacity, slots: sorted },
        };
        Promise.resolve().then(() => {
          manager.upsertEntityData(updatedEntity);
        });
        return sorted;
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
    },
    [cancelDrag, createPreview, drop, entity.entityId, startDrag, updatePointer],
  );

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
      </header>
      <div className={styles.grid}>
        {slots.map((slot) => {
          const blueprint = resolveBlueprint(slot.occupantId);
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
              onHoverChange={setHoveredSlotId}
              onStartDrag={handleStartDrag}
              onDrop={handleDropOnSlot}
              registerDropTarget={registerDropTarget}
              setActiveTarget={setActiveTarget}
              validateDrop={validateDrop}
            />
          );
        })}
      </div>
    </section>
  );
};

export default ChassisInspector;
