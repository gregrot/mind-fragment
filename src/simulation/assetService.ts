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

const drawShard = (graphic: Graphics, points: Array<[number, number]>, fill: number, stroke: number, alpha = 0.9): void => {
  graphic.beginPath();
  graphic.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    graphic.lineTo(points[i][0], points[i][1]);
  }
  graphic.closePath();
  graphic.fill({ color: fill, alpha });
  graphic.setStrokeStyle({ width: 2, color: stroke, alpha: 0.95 });
  graphic.stroke();
};

assetService.defineVectorAsset('resource/default', () => {
  const graphic = new Graphics();
  graphic.circle(0, 0, 16);
  graphic.fill({ color: 0xb0bec5, alpha: 0.85 });
  graphic.setStrokeStyle({ width: 3, color: 0x455a64, alpha: 0.95 });
  graphic.stroke();
  return graphic;
});

assetService.defineVectorAsset('resource/ferrous-ore', () => {
  const graphic = new Graphics();
  const points: Array<[number, number]> = [
    [0, -18],
    [14, -8],
    [16, 10],
    [2, 18],
    [-14, 8],
    [-12, -10],
  ];
  drawShard(graphic, points, 0x6c5b7b, 0x2c3e50);
  graphic.circle(-4, -2, 4);
  graphic.fill({ color: 0xdcd6f7, alpha: 0.75 });
  return graphic;
});

assetService.defineVectorAsset('resource/silicate-crystal', () => {
  const graphic = new Graphics();
  const shard: Array<[number, number]> = [
    [0, -20],
    [10, -2],
    [6, 20],
    [-8, 8],
  ];
  drawShard(graphic, shard, 0x74d2ff, 0x2a9d8f, 0.85);
  const innerShard: Array<[number, number]> = [
    [-6, -10],
    [2, -4],
    [4, 10],
    [-6, 2],
  ];
  drawShard(graphic, innerShard, 0xc0f5ff, 0x2a9d8f, 0.75);
  return graphic;
});

assetService.defineVectorAsset('resource/biotic-spore', () => {
  const graphic = new Graphics();
  graphic.circle(0, 0, 18);
  graphic.fill({ color: 0xff8c94, alpha: 0.78 });
  graphic.setStrokeStyle({ width: 3, color: 0xff2e63, alpha: 0.95 });
  graphic.stroke();

  graphic.circle(-6, -4, 6);
  graphic.fill({ color: 0xffffff, alpha: 0.65 });
  graphic.circle(7, 6, 4);
  graphic.fill({ color: 0xfff0f5, alpha: 0.8 });
  return graphic;
});

const drawModuleToken = (fill: number, stroke: number, detail: number): Graphics => {
  const graphic = new Graphics();
  graphic.roundRect(-20, -24, 40, 48, 8);
  graphic.fill({ color: fill, alpha: 0.9 });
  graphic.setStrokeStyle({ width: 3, color: stroke, alpha: 0.95 });
  graphic.stroke();

  graphic.roundRect(-12, -8, 24, 16, 4);
  graphic.fill({ color: detail, alpha: 0.95 });

  graphic.setStrokeStyle({ width: 2, color: stroke, alpha: 0.6 });
  graphic.moveTo(-10, 12);
  graphic.lineTo(10, 12);
  graphic.stroke();

  return graphic;
};

assetService.defineVectorAsset('module/movement', () => drawModuleToken(0x4ecdc4, 0x1a535c, 0xf4fdfd));
assetService.defineVectorAsset('module/manipulation', () => drawModuleToken(0xff6b6b, 0xc44536, 0xfff1f1));
assetService.defineVectorAsset('module/inventory', () => drawModuleToken(0x6ab04c, 0x218c74, 0xf6ffed));
assetService.defineVectorAsset('module/crafting', () => drawModuleToken(0xf7b731, 0xf4a261, 0xfff9e6));
assetService.defineVectorAsset('module/scanning', () => drawModuleToken(0x778beb, 0x4a69bd, 0xf1f4ff));
assetService.defineVectorAsset('module/status', () => drawModuleToken(0x9b5de5, 0x482677, 0xf7ecff));

export const RESOURCE_TEXTURE_IDS: Record<string, string> = {
  default: 'resource/default',
  'ferrous-ore': 'resource/ferrous-ore',
  'silicate-crystal': 'resource/silicate-crystal',
  'biotic-spore': 'resource/biotic-spore',
  'module:core.movement': 'module/movement',
  'module:arm.manipulator': 'module/manipulation',
  'module:storage.cargo': 'module/inventory',
  'module:fabricator.basic': 'module/crafting',
  'module:sensor.survey': 'module/scanning',
  'module:status.signal': 'module/status',
};
