import type { ReactNode } from 'react';
import type { EntityId } from '../simulation/ecs/world';

export interface Point {
  x: number;
  y: number;
}

export interface DragPreviewOffset {
  x: number;
  y: number;
}

export interface DragPreview {
  render: () => ReactNode;
  width: number;
  height: number;
  offset?: DragPreviewOffset;
}

export interface DragSource {
  type: string;
  id: string;
  entityId?: EntityId;
  slotId?: string;
  metadata?: Record<string, unknown>;
}

export interface DragPayload {
  id: string;
  itemType: string;
  stackCount?: number;
  metadata?: Record<string, unknown>;
}

export interface DropValidationResult {
  canDrop: boolean;
  reason?: string;
}

export interface SnapPosition {
  x: number;
  y: number;
}

export interface DragSession {
  source: DragSource;
  payload: DragPayload;
  preview?: DragPreview;
  onDropSuccess?: (details: DropSuccessDetails) => void;
  onDropCancel?: (details: DropCancelDetails) => void;
}

export interface DropTarget {
  id: string;
  type: string;
  metadata?: Record<string, unknown>;
  accepts: (session: DragSession) => DropValidationResult;
  onDrop: (session: DragSession, details: DropSuccessDetails) => void;
  getSnapPosition?: (session: DragSession, pointer: Point | null) => SnapPosition | null;
}

export interface DropSuccessDetails {
  target: DropTarget;
  snapPosition: SnapPosition | null;
  pointerPosition: Point | null;
  validation: DropValidationResult;
}

export interface DropCancelDetails {
  reason: string;
}

export type DropResult =
  | ({ status: 'success' } & DropSuccessDetails)
  | ({ status: 'cancelled' } & DropCancelDetails);
