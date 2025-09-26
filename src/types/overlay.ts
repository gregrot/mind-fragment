import type { EntityId } from '../simulation/ecs/world';
import type { ProgramRunnerStatus } from '../simulation/runtime/blockProgramRunner';
import type { Diagnostic } from '../simulation/runtime/blockProgram';
import type { SlotSchema } from './slots';

export type OverlayType = 'complex' | 'simple';

export type InspectorTabId = 'systems' | 'programming' | 'info';

export interface EntityOverlayData {
  entityId: EntityId;
  mechanismId?: string;
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
    status?: ProgramRunnerStatus;
    diagnostics?: Diagnostic[];
  };
  properties?: Record<string, unknown>;
}
