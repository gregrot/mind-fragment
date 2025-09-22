import { type Dispatch, type DragEvent, type SetStateAction, useCallback, useState } from 'react';
import { createBlockInstance, BLOCK_MAP } from '../blocks/library';
import { insertBlock, removeBlock, updateBlock } from '../state/blockUtils';
import type { BlockInstance, DragPayload, DropTarget, WorkspaceState } from '../types/blocks';

const PAYLOAD_MIME = 'application/json';

const isPalettePayload = (payload: DragPayload): payload is Extract<DragPayload, { source: 'palette' }> =>
  payload.source === 'palette';

const isWorkspacePayload = (
  payload: DragPayload,
): payload is Extract<DragPayload, { source: 'workspace' }> => payload.source === 'workspace';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parsePayload = (event: DragEvent<HTMLElement>): DragPayload | null => {
  const raw = event.dataTransfer?.getData(PAYLOAD_MIME);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || typeof parsed.source !== 'string') {
      return null;
    }

    if (parsed.source === 'palette' && typeof parsed.blockType === 'string') {
      return { source: 'palette', blockType: parsed.blockType };
    }

    if (parsed.source === 'workspace' && typeof parsed.instanceId === 'string') {
      return { source: 'workspace', instanceId: parsed.instanceId };
    }
  } catch (error) {
    console.warn('Failed to parse drag payload', error);
  }

  return null;
};

export function useBlockWorkspace(): {
  workspace: WorkspaceState;
  handleDrop: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
  handleTouchDrop: (payload: DragPayload, target: DropTarget) => void;
  replaceWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  updateBlockInstance: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
} {
  const [workspace, setWorkspace] = useState<WorkspaceState>([]);

  const applyDropPayload = useCallback(
    (payload: DragPayload | null, target: DropTarget) => {
      if (!payload) {
        return;
      }

      if (isPalettePayload(payload)) {
        if (!BLOCK_MAP[payload.blockType]) {
          return;
        }

        setWorkspace((current) => {
          const instance = createBlockInstance(payload.blockType);
          const result = insertBlock(current, target, instance);
          return result.inserted ? result.blocks : current;
        });
        return;
      }

      if (isWorkspacePayload(payload)) {
        if (target.ancestorIds.includes(payload.instanceId)) {
          return;
        }

        setWorkspace((current) => {
          const removal = removeBlock(current, payload.instanceId);
          if (!removal.removed) {
            return current;
          }

          const result = insertBlock(removal.blocks, target, removal.removed);
          return result.inserted ? result.blocks : removal.blocks;
        });
      }
    },
    [],
  );

  const handleDrop = useCallback((event: DragEvent<HTMLElement>, target: DropTarget) => {
    event.preventDefault();
    event.stopPropagation();

    const payload = parsePayload(event);
    applyDropPayload(payload, target);
  }, [applyDropPayload]);

  const handleTouchDrop = useCallback((payload: DragPayload, target: DropTarget) => {
    if (!payload) {
      return;
    }

    applyDropPayload(payload, target);
  }, [applyDropPayload]);

  const updateBlockInstance = useCallback(
    (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => {
      setWorkspace((current) => {
        const result = updateBlock(current, instanceId, updater);
        return result.changed ? result.blocks : current;
      });
    },
    [],
  );

  return {
    workspace,
    handleDrop,
    handleTouchDrop,
    replaceWorkspace: setWorkspace,
    updateBlockInstance,
  };
}
