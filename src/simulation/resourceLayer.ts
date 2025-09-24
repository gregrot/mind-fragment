import { Container, Renderer, Sprite } from 'pixi.js';
import { assetService, RESOURCE_TEXTURE_IDS } from './assetService';
import type {
  ResourceField,
  ResourceFieldEvent,
  ResourceNode,
} from './resources/resourceField';

interface ResourceSpriteEntry {
  sprite: Sprite;
  maxQuantity: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export class ResourceLayer {
  private readonly container: Container;
  private readonly spriteEntries = new Map<string, ResourceSpriteEntry>();
  private readonly pendingLoads = new Map<string, Promise<void>>();
  private readonly unsubscribe: () => void;
  private destroyed = false;

  constructor(private readonly renderer: Renderer, private readonly resourceField: ResourceField) {
    this.container = new Container();
    this.container.sortableChildren = false;

    for (const node of this.resourceField.list()) {
      this.ensureSprite(node);
    }

    this.unsubscribe = this.resourceField.subscribe((event) => {
      this.handleEvent(event);
    });
  }

  get view(): Container {
    return this.container;
  }

  dispose(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.unsubscribe();
    for (const [nodeId, entry] of this.spriteEntries.entries()) {
      this.disposeSprite(nodeId, entry);
    }
    this.spriteEntries.clear();
    this.container.destroy({ children: true });
  }

  destroy(): void {
    this.dispose();
  }

  private handleEvent(event: ResourceFieldEvent): void {
    if (this.destroyed) {
      return;
    }
    switch (event.type) {
      case 'added':
        this.ensureSprite(event.node);
        break;
      case 'updated':
        this.updateSprite(event.node);
        break;
      case 'restored':
        this.ensureSprite(event.node);
        break;
      case 'depleted':
        this.updateSprite(event.node);
        this.removeSprite(event.node.id);
        break;
      case 'removed':
        this.removeSprite(event.nodeId);
        break;
      default:
        break;
    }
  }

  private ensureSprite(node: ResourceNode): void {
    if (this.destroyed) {
      return;
    }

    if (this.spriteEntries.has(node.id)) {
      this.updateSprite(node);
      return;
    }

    if (this.pendingLoads.has(node.id)) {
      return;
    }

    const loadPromise = this.createSprite(node).finally(() => {
      this.pendingLoads.delete(node.id);
    });
    this.pendingLoads.set(node.id, loadPromise);
  }

  private async createSprite(node: ResourceNode): Promise<void> {
    const textureId = RESOURCE_TEXTURE_IDS[node.type] ?? RESOURCE_TEXTURE_IDS.default;
    const texture = await assetService.loadTexture(textureId, this.renderer, { resourceType: node.type });
    if (this.destroyed) {
      return;
    }

    if (this.spriteEntries.has(node.id)) {
      this.updateSprite(node);
      return;
    }

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(node.position.x, node.position.y);

    this.container.addChild(sprite);
    this.spriteEntries.set(node.id, {
      sprite,
      maxQuantity: Math.max(node.quantity, 1),
    });

    this.updateSprite(node);
  }

  private updateSprite(node: ResourceNode): void {
    const entry = this.spriteEntries.get(node.id);
    if (!entry) {
      this.ensureSprite(node);
      return;
    }

    entry.sprite.position.set(node.position.x, node.position.y);
    entry.maxQuantity = Math.max(entry.maxQuantity, Math.max(node.quantity, 1));
    const ratio = entry.maxQuantity > 0 ? clamp(node.quantity / entry.maxQuantity, 0, 1) : 0;
    const alpha = node.quantity > 0 ? 0.35 + ratio * 0.65 : 0;
    entry.sprite.alpha = alpha;
    const scale = 0.8 + ratio * 0.4;
    entry.sprite.scale.set(scale);
  }

  private removeSprite(nodeId: string): void {
    const entry = this.spriteEntries.get(nodeId);
    if (!entry) {
      return;
    }
    this.disposeSprite(nodeId, entry);
  }

  private disposeSprite(nodeId: string, entry: ResourceSpriteEntry): void {
    this.container.removeChild(entry.sprite);
    entry.sprite.destroy({ children: true, texture: false });
    this.spriteEntries.delete(nodeId);
  }
}
