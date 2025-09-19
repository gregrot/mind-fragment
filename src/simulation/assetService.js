import { Assets, Graphics } from 'pixi.js';

class AssetService {
  constructor() {
    this.cache = new Map();
    this.vectorFactories = new Map();
  }

  defineVectorAsset(id, factory) {
    this.vectorFactories.set(id, factory);
  }

  async loadTexture(id, renderer, options = {}) {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }

    if (this.vectorFactories.has(id)) {
      const graphic = this.vectorFactories.get(id)(options);
      const texture = renderer.generateTexture(graphic, {
        resolution: window.devicePixelRatio || 1,
        multisample: 1,
      });
      graphic.destroy(true);
      this.cache.set(id, texture);
      return texture;
    }

    const asset = await Assets.load(id);
    this.cache.set(id, asset);
    return asset;
  }

  release(id) {
    const asset = this.cache.get(id);
    if (asset) {
      asset.destroy?.(true);
      this.cache.delete(id);
    }
  }

  disposeAll() {
    this.cache.forEach((asset) => {
      asset?.destroy?.(true);
    });
    this.cache.clear();
  }
}

export const assetService = new AssetService();

assetService.defineVectorAsset('robot/chassis', ({ radius = 28, fill = 0x4ecdc4, stroke = 0x1a535c } = {}) => {
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
