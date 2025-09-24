import type { EntityId } from '../simulation/ecs/world';

export type OverlayType = 'complex' | 'simple';

export type InspectorTabId = 'systems' | 'programming' | 'info';

export interface SlotMetadata {
  stackable: boolean;
  moduleSubtype?: string;
  locked: boolean;
}

export interface SlotSchema {
  id: string;
  index: number;
  occupantId: string | null;
  stackCount?: number;
  metadata: SlotMetadata;
}

export interface EntityOverlayData {
  entityId: EntityId;
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
    activeBlockId?: string;
  };
  properties?: Record<string, unknown>;
}
