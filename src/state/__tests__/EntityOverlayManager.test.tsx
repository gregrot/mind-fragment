import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EntityOverlayManagerProvider, useEntityOverlayManager } from '../EntityOverlayManager';
import type { EntityOverlayData } from '../../types/overlay';
import type { EntityId } from '../../simulation/ecs/world';

const createOverlayData = (entityId: EntityId, overlayType: EntityOverlayData['overlayType']): EntityOverlayData => ({
  entityId,
  name: `Entity ${entityId}`,
  description: 'Test overlay data',
  overlayType,
});

describe('EntityOverlayManager', () => {
  it('opens an overlay and defaults to the systems tab for complex entities', () => {
    const { result } = renderHook(() => useEntityOverlayManager(), {
      wrapper: EntityOverlayManagerProvider,
    });

    act(() => {
      result.current.openOverlay(createOverlayData(1 as EntityId, 'complex'));
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.activeTab).toBe('systems');
    expect(result.current.selectedEntityId).toBe(1);
  });

  it('supports specifying an initial tab when opening', () => {
    const { result } = renderHook(() => useEntityOverlayManager(), {
      wrapper: EntityOverlayManagerProvider,
    });

    act(() => {
      result.current.openOverlay(createOverlayData(2 as EntityId, 'complex'), { initialTab: 'info' });
    });

    expect(result.current.activeTab).toBe('info');
  });

  it('closes the overlay and clears selection state', () => {
    const { result } = renderHook(() => useEntityOverlayManager(), {
      wrapper: EntityOverlayManagerProvider,
    });

    act(() => {
      result.current.openOverlay(createOverlayData(3 as EntityId, 'complex'));
    });

    act(() => {
      result.current.closeOverlay();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedEntityId).toBeNull();
  });

  it('upserts entity data for lookups', () => {
    const { result } = renderHook(() => useEntityOverlayManager(), {
      wrapper: EntityOverlayManagerProvider,
    });

    const data = createOverlayData(4 as EntityId, 'simple');

    act(() => {
      result.current.upsertEntityData(data);
    });

    expect(result.current.getEntityData(4 as EntityId)).toEqual(data);
  });
});
