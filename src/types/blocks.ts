export type BlockCategory = 'event' | 'action' | 'c' | string;

export interface BlockDefinition {
  id: string;
  label: string;
  category: BlockCategory;
  summary?: string;
  slots?: string[];
}

export interface BlockInstance {
  instanceId: string;
  type: string;
  slots?: Record<string, BlockInstance[]>;
}

export type WorkspaceState = BlockInstance[];

export interface WorkspaceDropTarget {
  kind: 'workspace';
  position?: number;
  ancestorIds: string[];
}

export interface SlotDropTarget {
  kind: 'slot';
  ownerId: string;
  slotName: string;
  position?: number;
  ancestorIds: string[];
}

export type DropTarget = WorkspaceDropTarget | SlotDropTarget;

export type DragPayload =
  | { source: 'palette'; blockType: string }
  | { source: 'workspace'; instanceId: string };
