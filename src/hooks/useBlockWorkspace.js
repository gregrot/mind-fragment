import { useCallback, useState } from 'react';
import { createBlockInstance, BLOCK_MAP } from '../blocks/library.js';
import { insertBlock, removeBlock } from '../state/blockUtils.js';

const PAYLOAD_MIME = 'application/json';

const parsePayload = (event) => {
  const raw = event.dataTransfer?.getData(PAYLOAD_MIME);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Failed to parse drag payload', error);
    return null;
  }
};

export function useBlockWorkspace() {
  const [workspace, setWorkspace] = useState([]);

  const handleDrop = useCallback((event, target) => {
    event.preventDefault();
    event.stopPropagation();

    const payload = parsePayload(event);
    if (!payload) {
      return;
    }

    if (payload.source === 'palette') {
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

    if (payload.source === 'workspace') {
      if (!payload.instanceId || target.ancestorIds?.includes(payload.instanceId)) {
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
  }, []);

  return {
    workspace,
    handleDrop
  };
}
