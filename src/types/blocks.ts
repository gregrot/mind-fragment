export type BlockCategory = 'event' | 'action' | 'c' | string;

export type BlockParameterKind = 'boolean' | 'number' | 'string' | 'signal' | 'operator';

export interface BlockParameterSignalOption {
  id: string;
  label: string;
  description?: string;
}

export type BlockParameterDefinition =
  | { kind: 'boolean'; defaultValue: boolean }
  | { kind: 'number'; defaultValue: number; min?: number; max?: number; step?: number }
  | { kind: 'string'; defaultValue: string }
  | {
      kind: 'signal';
      defaultValue: string | null;
      allowNone?: boolean;
      options: BlockParameterSignalOption[];
    }
  | { kind: 'operator'; valueType: 'boolean' | 'number'; label?: string };

export type BlockParameterValue =
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'signal'; value: string | null };

export interface BlockDefinition {
  id: string;
  label: string;
  category: BlockCategory;
  summary?: string;
  slots?: string[];
  parameters?: Record<string, BlockParameterDefinition>;
  expressionInputs?: string[];
  expressionInputDefaults?: Record<string, string[]>;
  paletteGroup?: string;
  paletteTags?: string[];
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

export interface ParameterExpressionDropTarget {
  kind: 'parameter-expression';
  ownerId: string;
  parameterName: string;
  position?: number;
  ancestorIds: string[];
}

export type DropTarget =
  | WorkspaceDropTarget
  | SlotDropTarget
  | ParameterDropTarget
  | ParameterExpressionDropTarget;

export type DragPayload =
  | { source: 'palette'; blockType: string }
  | { source: 'workspace'; instanceId: string }
  | { source: 'parameter'; ownerId: string; parameterName: string };
