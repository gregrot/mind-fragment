import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DragProvider, createGridSnapper, useDragContext } from '../DragContext';
import type { DragSession } from '../../types/drag';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <DragProvider>{children}</DragProvider>
);

const createSession = (overrides: Partial<DragSession> = {}): DragSession => ({
  source: {
    type: 'inventory-slot',
    id: 'slot-1',
  },
  payload: {
    id: 'module-1',
    itemType: 'module',
  },
  preview: {
    render: () => null,
    width: 32,
    height: 32,
    offset: { x: -16, y: -16 },
  },
  ...overrides,
});

describe('DragContext', () => {
  it('starts a drag session and records pointer position', () => {
    const { result } = renderHook(() => useDragContext(), { wrapper });

    act(() => {
      result.current.startDrag(createSession(), { pointer: { x: 120, y: 80 } });
    });

    expect(result.current.isDragging).toBe(true);
    expect(result.current.pointerPosition).toEqual({ x: 120, y: 80 });
    expect(result.current.preview?.width).toBe(32);

    act(() => {
      result.current.cancelDrag();
    });

    expect(result.current.isDragging).toBe(false);
  });

  it('performs a successful drop with snap-to-grid details', () => {
    const onDrop = vi.fn();
    const onDropSuccess = vi.fn();
    const { result } = renderHook(() => useDragContext(), { wrapper });

    act(() => {
      result.current.registerDropTarget({
        id: 'target-success',
        type: 'inventory-slot',
        accepts: () => ({ canDrop: true }),
        getSnapPosition: createGridSnapper({
          origin: { x: 0, y: 0 },
          cellSize: { width: 50, height: 50 },
        }),
        onDrop,
      });
    });

    act(() => {
      result.current.startDrag(
        createSession({
          onDropSuccess,
        }),
        { pointer: { x: 74, y: 125 } },
      );
    });

    let dropResult: ReturnType<typeof result.current.drop> | null = null;
    act(() => {
      dropResult = result.current.drop('target-success');
    });

    expect(onDrop).toHaveBeenCalledTimes(1);
    const dropArgs = onDrop.mock.calls[0];
    expect(dropArgs[1]).toMatchObject({
      snapPosition: { x: 50, y: 150 },
      validation: { canDrop: true },
    });

    expect(onDropSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        snapPosition: { x: 50, y: 150 },
        validation: { canDrop: true },
      }),
    );

    expect(dropResult).not.toBeNull();
    expect(dropResult).toMatchObject({
      status: 'success',
      snapPosition: { x: 50, y: 150 },
    });
    expect(result.current.isDragging).toBe(false);
  });

  it('cancels a drop when validation fails', () => {
    const onDrop = vi.fn();
    const onDropCancel = vi.fn();
    const { result } = renderHook(() => useDragContext(), { wrapper });

    act(() => {
      result.current.registerDropTarget({
        id: 'target-invalid',
        type: 'inventory-slot',
        accepts: () => ({ canDrop: false, reason: 'occupied' }),
        onDrop,
      });
    });

    act(() => {
      result.current.startDrag(createSession({ onDropCancel }));
    });

    let dropResult: ReturnType<typeof result.current.drop> | null = null;
    act(() => {
      dropResult = result.current.drop('target-invalid');
    });

    expect(onDrop).not.toHaveBeenCalled();
    expect(onDropCancel).toHaveBeenCalledWith({ reason: 'occupied' });
    expect(dropResult).toEqual({ status: 'cancelled', reason: 'occupied' });
    expect(result.current.isDragging).toBe(false);
  });

  it('evaluates drop targets when activated', () => {
    const { result } = renderHook(() => useDragContext(), { wrapper });

    act(() => {
      result.current.registerDropTarget({
        id: 'target-hover',
        type: 'chassis-slot',
        accepts: () => ({ canDrop: true }),
        onDrop: vi.fn(),
      });
    });

    act(() => {
      result.current.startDrag(createSession());
    });

    let validation: ReturnType<typeof result.current.setActiveTarget> | null = null;
    act(() => {
      validation = result.current.setActiveTarget('target-hover');
    });

    expect(validation).toEqual({ canDrop: true });
    expect(result.current.activeTargetId).toBe('target-hover');

    act(() => {
      result.current.setActiveTarget(null);
    });

    expect(result.current.activeTargetId).toBeNull();
    expect(result.current.validation).toBeNull();
  });
});

describe('createGridSnapper', () => {
  it('snaps to the nearest grid coordinate and respects clamps', () => {
    const snapper = createGridSnapper({
      origin: { x: 20, y: 40 },
      cellSize: { width: 30, height: 30 },
      clamp: { minColumn: 0, maxColumn: 2, minRow: -1, maxRow: 1 },
    });

    const snapped = snapper(createSession(), { x: 200, y: -80 });

    expect(snapped).toEqual({ x: 80, y: 10 });

    const centreSnap = snapper(createSession(), null);
    expect(centreSnap).toBeNull();
  });
});
