import type { EntityId } from '../simulation/ecs/world';
import type { SlotSchema } from './slots';

export type OverlayType = 'complex' | 'simple';

export type InspectorTabId = 'systems' | 'programming' | 'info';

export interface EntityOverlayData {
  entityId: EntityId;
  robotId?: string;
  name: string;
  description?: string;
  overlayType: OverlayType;
  chassis?: {
    capacity: number;
    slots: SlotSchema[];
  };
  inventory?: {
    capacity: number;
    slots: SlotSchema[];
  };
  programState?: {
    isRunning: boolean;
    activeBlockId?: string | null;
  };
  properties?: Record<string, unknown>;
}
