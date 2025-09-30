import type { Vector2 } from '../mechanism/mechanismState';

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

interface HitDropMetadata {
  type: string;
  quantity: number;
}

interface HitResourceMetadata {
  hitPoints: number;
  hitsRemaining: number;
  requiredTool?: string;
  drop?: HitDropMetadata;
}

export interface UpsertNodeOptions {
  id?: string;
  type: string;
  position: Vector2;
  quantity: number;
  mergeDistance?: number;
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

export interface RegisterHitOptions {
  nodeId: string;
  toolType?: string;
}

export interface RegisterHitResult {
  status: 'ok' | 'invalid-tool' | 'depleted' | 'not-found';
  nodeId: string;
  type: string | null;
  remaining: number;
}

export type ResourceFieldEvent =
  | { type: 'added'; node: ResourceNode }
  | { type: 'updated'; node: ResourceNode }
  | { type: 'depleted'; node: ResourceNode }
  | { type: 'restored'; node: ResourceNode }
  | { type: 'removed'; nodeId: string };

type ResourceFieldListener = (event: ResourceFieldEvent) => void;

const DEFAULT_FIELD_OF_VIEW = Math.PI / 2;
const DEFAULT_MAX_RESULTS = 6;
const DEFAULT_MAX_DISTANCE = 200;
const DEFAULT_MERGE_DISTANCE = 32;

const normaliseToolType = (toolType: string | undefined): string | null => {
  const trimmed = toolType?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

const extractHitMetadata = (metadata: Record<string, unknown> | undefined): HitResourceMetadata | null => {
  if (!metadata) {
    return null;
  }

  const rawHitPoints = (metadata as { hitPoints?: unknown }).hitPoints;
  if (typeof rawHitPoints !== 'number' || !Number.isFinite(rawHitPoints) || rawHitPoints <= 0) {
    return null;
  }

  const rawHitsRemaining = (metadata as { hitsRemaining?: unknown }).hitsRemaining;
  const hitsRemaining =
    typeof rawHitsRemaining === 'number' && Number.isFinite(rawHitsRemaining) && rawHitsRemaining >= 0
      ? clamp(rawHitsRemaining, 0, rawHitPoints)
      : rawHitPoints;

  const rawRequiredTool = (metadata as { requiredTool?: unknown }).requiredTool;
  const requiredTool = typeof rawRequiredTool === 'string' && rawRequiredTool.trim() ? rawRequiredTool.trim() : undefined;

  const rawDrop = (metadata as { drop?: unknown }).drop;
  let drop: HitDropMetadata | undefined;
  if (rawDrop && typeof rawDrop === 'object') {
    const dropType = (rawDrop as { type?: unknown }).type;
    const dropQuantity = (rawDrop as { quantity?: unknown }).quantity;
    if (typeof dropType === 'string' && dropType.trim() && typeof dropQuantity === 'number' && Number.isFinite(dropQuantity)) {
      if (dropQuantity > 0) {
        drop = { type: dropType.trim(), quantity: dropQuantity };
      }
    }
  }

  return {
    hitPoints: rawHitPoints,
    hitsRemaining,
    requiredTool,
    drop,
  };
};

const storeHitMetadata = (
  base: Record<string, unknown> | undefined,
  metadata: HitResourceMetadata,
): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...(base ?? {}) };
  next.hitPoints = metadata.hitPoints;
  next.hitsRemaining = metadata.hitsRemaining;
  if (metadata.requiredTool) {
    next.requiredTool = metadata.requiredTool;
  } else {
    delete next.requiredTool;
  }
  if (metadata.drop) {
    next.drop = { ...metadata.drop };
  } else {
    delete next.drop;
  }
  return next;
};

export class ResourceField {
  private readonly nodes = new Map<string, ResourceNode>();
  private readonly listeners = new Set<ResourceFieldListener>();
  private generatedNodeCounter = 0;

  constructor(initialNodes: ResourceNode[] = []) {
    for (const node of initialNodes) {
      if (!node?.id) {
        continue;
      }
      this.nodes.set(node.id, this.cloneNode(node));
    }
  }

  list(): ResourceNode[] {
    return [...this.nodes.values()].map((node) => this.cloneNode(node));
  }

  subscribe(listener: ResourceFieldListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  upsertNode({
    id,
    type,
    position,
    quantity,
    mergeDistance = DEFAULT_MERGE_DISTANCE,
    metadata,
  }: UpsertNodeOptions): ResourceNode {
    const trimmedType = type?.trim();
    if (!trimmedType) {
      throw new Error('Resource node requires a type.');
    }

    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
      throw new Error('Resource node requires a position.');
    }

    const safeQuantity = Number.isFinite(quantity) ? Math.max(quantity, 0) : 0;
    if (safeQuantity <= 0) {
      throw new Error('Resource node quantity must be greater than zero.');
    }

    const safePosition: Vector2 = {
      x: Number.isFinite(position.x) ? (position.x as number) : 0,
      y: Number.isFinite(position.y) ? (position.y as number) : 0,
    };

    const mergeRadius = Number.isFinite(mergeDistance) ? Math.max(mergeDistance, 0) : DEFAULT_MERGE_DISTANCE;
    const requestedId = id?.trim();
    const searchType = trimmedType.toLowerCase();

    let existing: ResourceNode | null = null;
    if (requestedId && this.nodes.has(requestedId)) {
      existing = this.nodes.get(requestedId) ?? null;
    } else if (mergeRadius > 0) {
      for (const node of this.nodes.values()) {
        if (node.type.toLowerCase() !== searchType) {
          continue;
        }
        const distance = distanceBetween(node.position, safePosition);
        if (distance <= mergeRadius) {
          existing = node;
          break;
        }
      }
    }

    const baseNode = existing ? this.cloneNode(existing) : null;
    const targetId = baseNode?.id ?? this.generateNodeId(requestedId, trimmedType);
    let mergedMetadata: Record<string, unknown> | undefined;
    if (metadata) {
      const baseMetadata = baseNode?.metadata ?? {};
      mergedMetadata = { ...baseMetadata, ...metadata };

      const rawHitPoints = (metadata as { hitPoints?: unknown }).hitPoints;
      const hasIncomingHitPoints =
        typeof rawHitPoints === 'number' && Number.isFinite(rawHitPoints) && rawHitPoints > 0;
      const hasIncomingHitsRemaining = Object.prototype.hasOwnProperty.call(metadata, 'hitsRemaining');

      if (hasIncomingHitPoints && !hasIncomingHitsRemaining) {
        mergedMetadata.hitsRemaining = rawHitPoints;
      }
    } else if (baseNode?.metadata) {
      mergedMetadata = { ...baseNode.metadata };
    }

    const nextNode: ResourceNode = {
      id: targetId,
      type: baseNode?.type ?? trimmedType,
      position: safePosition,
      quantity: (baseNode?.quantity ?? 0) + safeQuantity,
      metadata: mergedMetadata,
    };

    const sanitised = this.cloneNode(nextNode);
    this.nodes.set(sanitised.id, sanitised);
    this.notifyListeners({ type: existing ? 'updated' : 'added', node: this.cloneNode(sanitised) });
    return this.cloneNode(sanitised);
  }

  removeNode(nodeId: string): boolean {
    if (!this.nodes.has(nodeId)) {
      return false;
    }
    this.nodes.delete(nodeId);
    this.notifyListeners({ type: 'removed', nodeId });
    return true;
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

  registerHit({ nodeId, toolType }: RegisterHitOptions): RegisterHitResult {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return { status: 'not-found', nodeId, type: null, remaining: 0 };
    }

    const metadata = extractHitMetadata(node.metadata);
    const normalisedTool = normaliseToolType(toolType);

    if (!metadata) {
      if (node.quantity <= 0) {
        return { status: 'depleted', nodeId, type: node.type, remaining: 0 };
      }
      const nextQuantity = Math.max(node.quantity - 1, 0);
      node.quantity = nextQuantity;
      if (nextQuantity > 0) {
        this.notifyListeners({ type: 'updated', node: this.cloneNode(node) });
        return { status: 'ok', nodeId, type: node.type, remaining: nextQuantity };
      }
      this.notifyListeners({ type: 'depleted', node: this.cloneNode(node) });
      return { status: 'depleted', nodeId, type: node.type, remaining: 0 };
    }

    if (metadata.requiredTool) {
      const expected = normaliseToolType(metadata.requiredTool);
      if (expected && expected !== normalisedTool) {
        return { status: 'invalid-tool', nodeId, type: node.type, remaining: metadata.hitsRemaining };
      }
    }

    const hitsRemaining = clamp(metadata.hitsRemaining, 0, metadata.hitPoints);
    node.quantity = hitsRemaining;

    const resolveDepletion = (): RegisterHitResult => {
      this.notifyListeners({ type: 'depleted', node: this.cloneNode(node) });

      const drop = metadata.drop;
      if (drop) {
        const dropType = drop.type.trim();
        const dropQuantity = drop.quantity;
        if (dropType && Number.isFinite(dropQuantity) && dropQuantity > 0) {
          this.upsertNode({
            type: dropType,
            position: { ...node.position },
            quantity: dropQuantity,
          });
        }
      }

      return { status: 'depleted', nodeId, type: node.type, remaining: 0 };
    };

    if (hitsRemaining <= 0) {
      return resolveDepletion();
    }

    const nextHits = hitsRemaining - 1;
    const nextMetadata: HitResourceMetadata = {
      hitPoints: metadata.hitPoints,
      hitsRemaining: Math.max(nextHits, 0),
      requiredTool: metadata.requiredTool,
      drop: metadata.drop,
    };
    node.quantity = nextMetadata.hitsRemaining;
    node.metadata = storeHitMetadata(node.metadata, nextMetadata);

    if (nextMetadata.hitsRemaining > 0) {
      this.notifyListeners({ type: 'updated', node: this.cloneNode(node) });
      return { status: 'ok', nodeId, type: node.type, remaining: nextMetadata.hitsRemaining };
    }

    return resolveDepletion();
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

    if (harvested > 0) {
      if (node.quantity > 0) {
        this.notifyListeners({ type: 'updated', node: this.cloneNode(node) });
      } else {
        this.notifyListeners({ type: 'depleted', node: this.cloneNode(node) });
      }
    }

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
    const previous = node.quantity;
    node.quantity += amount;
    this.notifyListeners({ type: previous <= 0 ? 'restored' : 'updated', node: this.cloneNode(node) });
    return node.quantity;
  }

  private generateNodeId(preferredId: string | undefined, type: string): string {
    const trimmedPreferred = preferredId?.trim();
    if (trimmedPreferred && !this.nodes.has(trimmedPreferred)) {
      return trimmedPreferred;
    }

    const base = type
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'resource';

    let attempt = this.generatedNodeCounter;
    while (true) {
      attempt += 1;
      const candidate = `node-${base}-${attempt.toString(36)}`;
      if (!this.nodes.has(candidate)) {
        this.generatedNodeCounter = attempt;
        return candidate;
      }
    }
  }

  private notifyListeners(event: ResourceFieldEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private cloneNode(node: ResourceNode): ResourceNode {
    return {
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      quantity: Math.max(node.quantity, 0),
      metadata: node.metadata ? { ...node.metadata } : undefined,
    };
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
  {
    id: 'node-tree-1',
    type: 'tree',
    position: { x: -340, y: -220 },
    quantity: 3,
    metadata: {
      hitPoints: 3,
      hitsRemaining: 3,
      requiredTool: 'axe',
      drop: { type: 'log', quantity: 2 },
    },
  },
  {
    id: 'node-tree-2',
    type: 'tree',
    position: { x: 360, y: 260 },
    quantity: 3,
    metadata: {
      hitPoints: 3,
      hitsRemaining: 3,
      requiredTool: 'axe',
      drop: { type: 'log', quantity: 2 },
    },
  },
];
