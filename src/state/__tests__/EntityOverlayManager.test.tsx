import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  EntityOverlayManagerProvider,
  useEntityOverlayManager,
  type EntityPersistenceState,
} from '../EntityOverlayManager';
import type { EntityOverlayData } from '../../types/overlay';
import type { EntityId } from '../../simulation/ecs/world';
import type { OverlayPersistenceAdapter } from '../overlayPersistence';

const createOverlayData = (entityId: EntityId, overlayType: EntityOverlayData['overlayType']): EntityOverlayData => ({
  entityId,
  name: `Entity ${entityId}`,
  description: 'Test overlay data',
  overlayType,
});

const createAdapter = (overrides?: Partial<OverlayPersistenceAdapter>): OverlayPersistenceAdapter => ({
  saveEntity: vi.fn(async () => {}),
  removeEntity: vi.fn(async () => {}),
  ...overrides,
});

const renderManager = (adapter?: OverlayPersistenceAdapter) =>
  renderHook(() => useEntityOverlayManager(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <EntityOverlayManagerProvider persistenceAdapter={adapter}>
        {children}
      </EntityOverlayManagerProvider>
    ),
  });

describe('EntityOverlayManager', () => {
  it('opens an overlay and defaults to the systems tab for complex entities', () => {
    const { result } = renderManager();

    act(() => {
      result.current.openOverlay(createOverlayData(1 as EntityId, 'complex'));
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeTab).toBe('systems');
    expect(result.current.selectedEntityId).toBe(1);
  });

  it('opens an overlay and defaults to the info tab for simple entities', () => {
    const { result } = renderManager();

    act(() => {
      result.current.openOverlay(createOverlayData(8 as EntityId, 'simple'));
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeTab).toBe('info');
    expect(result.current.selectedEntityId).toBe(8);
  });

  it('supports specifying an initial tab when opening', () => {
    const { result } = renderManager();

    act(() => {
      result.current.openOverlay(createOverlayData(2 as EntityId, 'complex'), { initialTab: 'info' });
    });

    expect(result.current.activeTab).toBe('info');
  });

  it('closes the overlay and clears selection state', () => {
    const { result } = renderManager();

    act(() => {
      result.current.openOverlay(createOverlayData(3 as EntityId, 'complex'));
    });

    act(() => {
      result.current.closeOverlay();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedEntityId).toBeNull();
  });

  it('upserts entity data for lookups', async () => {
    const adapter = createAdapter();
    const { result } = renderManager(adapter);
    const data = createOverlayData(4 as EntityId, 'simple');

    await act(async () => {
      result.current.upsertEntityData(data);
      await Promise.resolve();
    });

    expect(adapter.saveEntity).toHaveBeenCalledWith(data, undefined);
    expect(result.current.getEntityData(4 as EntityId)).toEqual(data);
  });

  it('emits change and persistence events to subscribers', async () => {
    const adapter = createAdapter();
    const listener = vi.fn();
    const { result } = renderManager(adapter);
    const data = createOverlayData(5 as EntityId, 'complex');

    act(() => {
      result.current.subscribe(listener);
    });

    await act(async () => {
      result.current.upsertEntityData(data);
      await Promise.resolve();
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'change', changeType: 'upsert', entityId: data.entityId }),
    );
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'save-start' }));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'save-success' }));
  });

  it('tracks persistence state transitions', async () => {
    let resolveSave: (() => void) | null = null;
    const adapter = createAdapter({
      saveEntity: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      ),
    });
    const { result } = renderManager(adapter);
    const data = createOverlayData(6 as EntityId, 'complex');

    await act(async () => {
      result.current.upsertEntityData(data);
      await Promise.resolve();
    });

    let state: EntityPersistenceState = result.current.getPersistenceState(data.entityId);
    expect(state.status).toBe('saving');

    act(() => {
      resolveSave?.();
    });

    await act(async () => {
      await Promise.resolve();
    });

    state = result.current.getPersistenceState(data.entityId);
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
  });

  it('reverts optimistic updates and exposes retry helpers when persistence fails', async () => {
    const error = new Error('save failed');
    const adapter = createAdapter({
      saveEntity: vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined),
    });
    const { result } = renderManager(adapter);
    const data = createOverlayData(7 as EntityId, 'complex');
    const listener = vi.fn();

    act(() => {
      result.current.subscribe(listener);
    });

    await act(async () => {
      result.current.upsertEntityData(data);
      await Promise.resolve();
    });

    let state = result.current.getPersistenceState(data.entityId);
    expect(state.status).toBe('error');
    expect(state.error).toBe(error);
    expect(result.current.getEntityData(data.entityId)).toBeUndefined();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'save-error', entityId: data.entityId, error }),
    );

    await act(async () => {
      result.current.retryPersistence(data.entityId);
      await Promise.resolve();
    });

    state = result.current.getPersistenceState(data.entityId);
    expect(state.status).toBe('idle');
    expect(adapter.saveEntity).toHaveBeenCalledTimes(2);
    expect(result.current.getEntityData(data.entityId)).toEqual(data);

    const changeEvents = listener.mock.calls.filter(
      ([event]) => event.type === 'change' && event.entityId === data.entityId,
    );
    expect(changeEvents).toHaveLength(2);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'save-success', entityId: data.entityId }),
    );
  });
});
