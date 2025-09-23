import type { InventorySnapshot } from './inventory';
import type { ModuleSnapshot } from './moduleStack';

export const MODULE_RESOURCE_PREFIX = 'module:';

export interface ModuleInventoryEntry {
  id: string;
  quantity: number;
}

export interface DroppedModuleEntry {
  nodeId: string;
  moduleId: string;
  quantity: number;
  position: { x: number; y: number };
  distance: number;
}

export interface ModuleStateSnapshot {
  installed: ModuleSnapshot[];
  inventory: ModuleInventoryEntry[];
  ground: DroppedModuleEntry[];
}

export const toModuleResourceId = (moduleId: string): string =>
  `${MODULE_RESOURCE_PREFIX}${moduleId.trim().toLowerCase()}`;

export const fromModuleResourceId = (resourceId: string): string | null => {
  if (!resourceId?.toLowerCase().startsWith(MODULE_RESOURCE_PREFIX)) {
    return null;
  }
  const moduleId = resourceId.slice(MODULE_RESOURCE_PREFIX.length);
  return moduleId ? moduleId : null;
};

export const extractModuleInventory = (snapshot: InventorySnapshot): ModuleInventoryEntry[] => {
  const modules: ModuleInventoryEntry[] = [];
  for (const entry of snapshot.entries) {
    const moduleId = fromModuleResourceId(entry.resource);
    if (!moduleId) {
      continue;
    }
    const quantity = Math.max(Math.round(entry.quantity), 0);
    if (quantity <= 0) {
      continue;
    }
    modules.push({ id: moduleId, quantity });
  }
  modules.sort((a, b) => a.id.localeCompare(b.id));
  return modules;
};

export const EMPTY_MODULE_STATE: ModuleStateSnapshot = {
  installed: [],
  inventory: [],
  ground: [],
};

export const distanceBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};
