import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  DragPreview,
  DragSession,
  DropResult,
  DropTarget,
  DropValidationResult,
  Point,
  SnapPosition,
} from '../types/drag';

interface DragContextValue {
  isDragging: boolean;
  session: DragSession | null;
  preview: DragPreview | null;
  pointerPosition: Point | null;
  activeTargetId: string | null;
  validation: DropValidationResult | null;
  startDrag: (session: DragSession, options?: { pointer?: Point }) => void;
  updatePreview: (preview: DragPreview | null) => void;
  updatePointer: (position: Point | null) => void;
  registerDropTarget: (target: DropTarget) => () => void;
  setActiveTarget: (targetId: string | null) => DropValidationResult | null;
  drop: (targetId?: string) => DropResult;
  cancelDrag: (reason?: string) => void;
}

const DragContext = createContext<DragContextValue | undefined>(undefined);

const DEFAULT_CANCEL_REASON = 'cancelled';

const clampValue = (value: number, min?: number, max?: number): number => {
  let result = value;
  if (typeof min === 'number') {
    result = Math.max(result, min);
  }
  if (typeof max === 'number') {
    result = Math.min(result, max);
  }
  return result;
};

export interface GridSnapConfig {
  origin: Point;
  cellSize: { width: number; height: number };
  clamp?: {
    minColumn?: number;
    maxColumn?: number;
    minRow?: number;
    maxRow?: number;
  };
}

export const createGridSnapper = (config: GridSnapConfig) => {
  const { origin, cellSize, clamp } = config;

  if (cellSize.width <= 0 || cellSize.height <= 0) {
    throw new Error('Grid snap cell sizes must be positive numbers.');
  }

  return (_session: DragSession, pointer: Point | null): SnapPosition | null => {
    if (!pointer) {
      return null;
    }

    const rawColumn = Math.round((pointer.x - origin.x) / cellSize.width);
    const rawRow = Math.round((pointer.y - origin.y) / cellSize.height);

    const column = clampValue(rawColumn, clamp?.minColumn, clamp?.maxColumn);
    const row = clampValue(rawRow, clamp?.minRow, clamp?.maxRow);

    return {
      x: origin.x + column * cellSize.width,
      y: origin.y + row * cellSize.height,
    };
  };
};

export const DragProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const dropTargetsRef = useRef<Map<string, DropTarget>>(new Map());
  const [session, setSession] = useState<DragSession | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [pointerPosition, setPointerPosition] = useState<Point | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const [validation, setValidation] = useState<DropValidationResult | null>(null);

  const resetState = useCallback(() => {
    setSession(null);
    setPreview(null);
    setPointerPosition(null);
    setActiveTargetId(null);
    setValidation(null);
  }, []);

  const startDrag = useCallback(
    (nextSession: DragSession, options?: { pointer?: Point }) => {
      setSession(nextSession);
      setPreview(nextSession.preview ?? null);
      setPointerPosition(options?.pointer ?? null);
      setActiveTargetId(null);
      setValidation(null);
    },
    [],
  );

  const updatePreview = useCallback((nextPreview: DragPreview | null) => {
    setPreview(nextPreview);
  }, []);

  const updatePointer = useCallback((position: Point | null) => {
    setPointerPosition(position);
  }, []);

  const registerDropTarget = useCallback((target: DropTarget) => {
    const map = dropTargetsRef.current;
    if (map.has(target.id)) {
      throw new Error(`Drop target with id "${target.id}" already registered.`);
    }
    map.set(target.id, target);

    return () => {
      const current = dropTargetsRef.current.get(target.id);
      if (current === target) {
        dropTargetsRef.current.delete(target.id);
      }
    };
  }, []);

  const resolveTarget = useCallback((targetId: string | null): DropTarget | null => {
    if (!targetId) {
      return null;
    }
    return dropTargetsRef.current.get(targetId) ?? null;
  }, []);

  const setActiveTarget = useCallback(
    (targetId: string | null): DropValidationResult | null => {
      const target = resolveTarget(targetId);
      if (!session || !target) {
        setActiveTargetId(null);
        setValidation(null);
        return null;
      }

      const result = target.accepts(session);
      setActiveTargetId(targetId);
      setValidation(result);
      return result;
    },
    [resolveTarget, session],
  );

  const cancelDrag = useCallback(
    (reason?: string) => {
      if (session?.onDropCancel) {
        session.onDropCancel({ reason: reason ?? DEFAULT_CANCEL_REASON });
      }
      resetState();
    },
    [resetState, session],
  );

  const drop = useCallback(
    (targetId?: string): DropResult => {
      if (!session) {
        return { status: 'cancelled', reason: 'no-active-session' };
      }

      const resolvedTargetId = targetId ?? activeTargetId;
      const target = resolveTarget(resolvedTargetId ?? null);

      if (!target) {
        cancelDrag('no-target');
        return { status: 'cancelled', reason: 'no-target' };
      }

      const validationResult = target.accepts(session);
      if (!validationResult.canDrop) {
        cancelDrag(validationResult.reason ?? 'invalid-drop');
        return { status: 'cancelled', reason: validationResult.reason ?? 'invalid-drop' };
      }

      const snapPosition = target.getSnapPosition
        ? target.getSnapPosition(session, pointerPosition)
        : null;

      const success = {
        target,
        snapPosition,
        pointerPosition,
        validation: validationResult,
      } as const;

      target.onDrop(session, success);
      session.onDropSuccess?.(success);
      resetState();

      return { status: 'success', ...success };
    },
    [activeTargetId, cancelDrag, pointerPosition, resetState, resolveTarget, session],
  );

  const value = useMemo<DragContextValue>(
    () => ({
      isDragging: session !== null,
      session,
      preview,
      pointerPosition,
      activeTargetId,
      validation,
      startDrag,
      updatePreview,
      updatePointer,
      registerDropTarget,
      setActiveTarget,
      drop,
      cancelDrag,
    }),
    [
      activeTargetId,
      cancelDrag,
      drop,
      pointerPosition,
      preview,
      registerDropTarget,
      session,
      setActiveTarget,
      startDrag,
      updatePointer,
      updatePreview,
      validation,
    ],
  );

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
};

export const useDragContext = (): DragContextValue => {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useDragContext must be used within a DragProvider');
  }
  return context;
};
