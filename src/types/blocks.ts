export type BlockCategory = 'event' | 'action' | 'c' | string;

export type BlockParameterKind = 'boolean' | 'number' | 'string';

export type BlockParameterDefinition =
  | { kind: 'boolean'; defaultValue: boolean }
  | { kind: 'number'; defaultValue: number }
  | { kind: 'string'; defaultValue: string };

export type BlockParameterValue =
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string };

export interface BlockDefinition {
  id: string;
  label: string;
  category: BlockCategory;
  summary?: string;
  slots?: string[];
  parameters?: Record<string, BlockParameterDefinition>;
  expressionInputs?: string[];
}

export interface BlockInstance {
  instanceId: string;
  type: string;
  slots?: Record<string, BlockInstance[]>;
  parameters?: Record<string, BlockParameterValue>;
  expressionInputs?: Record<string, BlockInstance[]>;
  state?: Record<string, unknown>;
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

export interface ParameterDropTarget {
  kind: 'parameter';
  ownerId: string;
  parameterName: string;
  position?: number;
  ancestorIds: string[];
}

export type DropTarget = WorkspaceDropTarget | SlotDropTarget | ParameterDropTarget;

export type DragPayload =
  | { source: 'palette'; blockType: string }
  | { source: 'workspace'; instanceId: string }
  | { source: 'parameter'; ownerId: string; parameterName: string };
