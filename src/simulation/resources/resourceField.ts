import type { Vector2 } from '../robot/robotState';

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const normaliseAngle = (angle: number): number => {
  let result = angle;
  while (result <= -Math.PI) {
    result += Math.PI * 2;
  }
  while (result > Math.PI) {
    result -= Math.PI * 2;
  }
  return result;
};

const distanceBetween = (a: Vector2, b: Vector2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

const angleBetween = (origin: Vector2, target: Vector2): number => {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  return Math.atan2(dy, dx);
};

export interface ResourceNode {
  id: string;
  type: string;
  position: Vector2;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface ResourceHit {
  id: string;
  type: string;
  position: Vector2;
  quantity: number;
  distance: number;
}

export interface ScanOptions {
  origin: Vector2;
  orientation: number;
  range: number;
  resourceType?: string;
  fieldOfView?: number;
  maxResults?: number;
}

export interface ResourceScanResult {
  filter: string | null;
  hits: ResourceHit[];
  total: number;
}

export interface HarvestOptions {
  nodeId: string;
  origin: Vector2;
  amount: number;
  maxDistance?: number;
}

export interface HarvestResult {
  status: 'ok' | 'out-of-range' | 'depleted' | 'not-found';
  nodeId: string;
  type: string | null;
  harvested: number;
  remaining: number;
  distance: number;
}

const DEFAULT_FIELD_OF_VIEW = Math.PI / 2;
const DEFAULT_MAX_RESULTS = 6;
const DEFAULT_MAX_DISTANCE = 200;

export class ResourceField {
  private readonly nodes = new Map<string, ResourceNode>();

  constructor(initialNodes: ResourceNode[] = []) {
    for (const node of initialNodes) {
      if (!node?.id) {
        continue;
      }
      this.nodes.set(node.id, {
        id: node.id,
        type: node.type,
        position: { x: node.position.x, y: node.position.y },
        quantity: Math.max(node.quantity, 0),
        metadata: node.metadata ? { ...node.metadata } : undefined,
      });
    }
  }

  list(): ResourceNode[] {
    return [...this.nodes.values()].map((node) => ({
      id: node.id,
      type: node.type,
      position: { ...node.position },
      quantity: node.quantity,
      metadata: node.metadata ? { ...node.metadata } : undefined,
    }));
  }

  scan({
    origin,
    orientation,
    range,
    resourceType,
    fieldOfView = DEFAULT_FIELD_OF_VIEW,
    maxResults = DEFAULT_MAX_RESULTS,
  }: ScanOptions): ResourceScanResult {
    const hits: ResourceHit[] = [];
    const normalisedOrientation = normaliseAngle(orientation);
    const halfFov = clamp(fieldOfView, Math.PI / 12, Math.PI) / 2;
    const maxDistance = Math.max(range, 0);
    const targetType = resourceType?.trim() ? resourceType.trim().toLowerCase() : null;

    for (const node of this.nodes.values()) {
      if (targetType && node.type.toLowerCase() !== targetType) {
        continue;
      }

      if (node.quantity <= 0) {
        continue;
      }

      const distance = distanceBetween(origin, node.position);
      if (distance > maxDistance) {
        continue;
      }

      const bearing = angleBetween(origin, node.position);
      const offset = Math.abs(normaliseAngle(bearing - normalisedOrientation));
      if (offset > halfFov) {
        continue;
      }

      hits.push({
        id: node.id,
        type: node.type,
        position: { ...node.position },
        quantity: node.quantity,
        distance,
      });
    }

    hits.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));

    const limitedHits = hits.slice(0, Math.max(maxResults, 1));

    return {
      filter: targetType,
      hits: limitedHits,
      total: hits.length,
    };
  }

  harvest({ nodeId, origin, amount, maxDistance = DEFAULT_MAX_DISTANCE }: HarvestOptions): HarvestResult {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return {
        status: 'not-found',
        nodeId,
        type: null,
        harvested: 0,
        remaining: 0,
        distance: Number.POSITIVE_INFINITY,
      };
    }

    const distance = distanceBetween(origin, node.position);
    if (distance > maxDistance) {
      return {
        status: 'out-of-range',
        nodeId,
        type: node.type,
        harvested: 0,
        remaining: node.quantity,
        distance,
      };
    }

    if (node.quantity <= 0) {
      return {
        status: 'depleted',
        nodeId,
        type: node.type,
        harvested: 0,
        remaining: 0,
        distance,
      };
    }

    const requested = Math.max(amount, 0);
    if (requested <= 0) {
      return {
        status: 'ok',
        nodeId,
        type: node.type,
        harvested: 0,
        remaining: node.quantity,
        distance,
      };
    }

    const harvested = Math.min(requested, node.quantity);
    node.quantity -= harvested;

    return {
      status: node.quantity > 0 ? 'ok' : 'depleted',
      nodeId,
      type: node.type,
      harvested,
      remaining: node.quantity,
      distance,
    };
  }

  restore(nodeId: string, amount: number): number {
    const node = this.nodes.get(nodeId);
    if (!node || !Number.isFinite(amount) || amount <= 0) {
      return node?.quantity ?? 0;
    }
    node.quantity += amount;
    return node.quantity;
  }
}

export const createDefaultResourceNodes = (): ResourceNode[] => [
  {
    id: 'node-ferrous-1',
    type: 'ferrous-ore',
    position: { x: 160, y: 40 },
    quantity: 50,
    metadata: { richness: 'moderate' },
  },
  {
    id: 'node-silicate-1',
    type: 'silicate-crystal',
    position: { x: -120, y: 200 },
    quantity: 35,
    metadata: { richness: 'high' },
  },
  {
    id: 'node-biotic-1',
    type: 'biotic-spore',
    position: { x: 260, y: -140 },
    quantity: 20,
    metadata: { volatile: true },
  },
];
