import type { EntityId } from '../simulation/ecs/world';
import { simulationRuntime } from './simulationRuntime';
import type { EntityOverlayData } from '../types/overlay';

export interface OverlayPersistenceAdapter {
  saveEntity: (next: EntityOverlayData, previous: EntityOverlayData | undefined) => Promise<void>;
  removeEntity: (entityId: EntityId, previous: EntityOverlayData | undefined) => Promise<void>;
}

const defaultAdapter: OverlayPersistenceAdapter = {
  async saveEntity(next) {
    if (next.overlayType !== 'complex') {
      return;
    }
    if (next.chassis) {
      simulationRuntime.applyChassisOverlayUpdate(next.chassis);
    }
    if (next.inventory) {
      simulationRuntime.applyInventoryOverlayUpdate(next.inventory);
    }
  },
  async removeEntity() {
    // Complex overlays remain in memory so there is no persistence layer to clear.
  },
};

export const getDefaultOverlayPersistenceAdapter = (): OverlayPersistenceAdapter => defaultAdapter;
