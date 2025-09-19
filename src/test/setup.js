import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('pixi.js', () => {
  class MockTicker {
    constructor() {
      this.add = vi.fn();
      this.remove = vi.fn();
    }
  }

  class MockRenderer {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.events = {};
    }
  }

  class MockApplication {
    constructor() {
      this.ticker = new MockTicker();
      this.renderer = new MockRenderer();
      this.stage = { addChild: vi.fn() };
      this.canvas = {};
    }

    async init() {
      return this;
    }

    destroy() {}
  }

  class MockContainer {
    constructor() {
      this.children = [];
    }
    addChild(child) {
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child);
    }
  }

  class MockGraphics extends MockContainer {
    lineStyle() {
      return this;
    }
    moveTo() {
      return this;
    }
    lineTo() {
      return this;
    }
  }

  class MockSprite extends MockContainer {
    constructor() {
      super();
      this.anchor = { set: vi.fn() };
      this.position = { set: vi.fn() };
      this.rotation = 0;
    }
  }

  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: MockGraphics,
    Sprite: MockSprite,
  };
});

vi.mock('pixi-viewport', () => ({
  Viewport: class {
    constructor() {
      this.renderer = { width: 0, height: 0 };
      this.plugins = { pause: vi.fn(), resume: vi.fn() };
    }

    drag() {
      return this;
    }

    wheel() {
      return this;
    }

    pinch() {
      return this;
    }

    decelerate() {
      return this;
    }

    addChild() {}

    update() {}

    resize() {}

    destroy() {}
  },
}));
