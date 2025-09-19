import { Assets, Graphics, Renderer, type Texture } from 'pixi.js';

type VectorAssetFactory = (options?: Record<string, unknown>) => Graphics;

class AssetService {
  private readonly cache = new Map<string, Texture>();
  private readonly vectorFactories = new Map<string, VectorAssetFactory>();

  defineVectorAsset(id: string, factory: VectorAssetFactory): void {
    this.vectorFactories.set(id, factory);
  }

  async loadTexture(
    id: string,
    renderer: Renderer,
    options: Record<string, unknown> = {},
  ): Promise<Texture> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const vectorFactory = this.vectorFactories.get(id);
    if (vectorFactory) {
      const graphic = vectorFactory(options);
      const texture = renderer.generateTexture(graphic);
      graphic.destroy(true);
      this.cache.set(id, texture);
      return texture;
    }

    const asset = (await Assets.load(id)) as Texture;
    this.cache.set(id, asset);
    return asset;
  }

  release(id: string): void {
    const asset = this.cache.get(id);
    if (asset) {
      asset.destroy(true);
      this.cache.delete(id);
    }
  }

  disposeAll(): void {
    this.cache.forEach((asset) => {
      asset.destroy(true);
    });
    this.cache.clear();
  }
}

export const assetService = new AssetService();

interface RobotChassisOptions {
  radius?: number;
  fill?: number;
  stroke?: number;
}

assetService.defineVectorAsset('robot/chassis', ({ radius = 28, fill = 0x4ecdc4, stroke = 0x1a535c }: RobotChassisOptions = {}) => {
  const graphic = new Graphics();

  graphic.circle(0, 0, radius);
  graphic.fill({ color: fill, alpha: 0.92 });
  graphic.setStrokeStyle({ width: 4, color: stroke, alpha: 1 });
  graphic.stroke();

  graphic.beginPath();
  graphic.setStrokeStyle({ width: 2, color: 0xffffff, alpha: 0.65 });
  graphic.moveTo(-radius * 0.6, 0);
  graphic.lineTo(radius * 0.6, 0);
  graphic.moveTo(0, -radius * 0.6);
  graphic.lineTo(0, radius * 0.6);
  graphic.stroke();

  return graphic;
});
