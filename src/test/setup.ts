import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('pixi.js', () => {
  class MockTicker {
    add = vi.fn();
    remove = vi.fn();
  }

  class MockRenderer {
    width = 0;
    height = 0;
    events: Record<string, unknown> = {};
    generateTexture = vi.fn(() => ({ destroy: vi.fn() }));
    destroy = vi.fn();
  }

  class MockContainer {
    children: unknown[] = [];

    addChild<T>(child: T): T {
      this.children.push(child);
      return child;
    }

    removeChild<T>(child: T): T {
      this.children = this.children.filter((entry) => entry !== child);
      return child;
    }

    destroy = vi.fn();
  }

  class MockGraphics extends MockContainer {
    lineStyle(): this {
      return this;
    }
    moveTo(): this {
      return this;
    }
    lineTo(): this {
      return this;
    }
  }

  class MockSprite extends MockContainer {
    anchor = {
      x: 0,
      y: 0,
      set: vi.fn((x: number, y?: number) => {
        this.anchor.x = x;
        this.anchor.y = y ?? x;
      }),
    };
    position = {
      x: 0,
      y: 0,
      set: vi.fn((x: number, y: number) => {
        this.position.x = x;
        this.position.y = y;
      }),
    };
    scale = {
      x: 1,
      y: 1,
      set: vi.fn((x: number, y?: number) => {
        this.scale.x = x;
        this.scale.y = y ?? x;
      }),
    };
    alpha = 1;
    rotation = 0;
    destroy = vi.fn();
  }

  class MockApplication {
    ticker = new MockTicker();
    renderer = new MockRenderer();
    stage = { addChild: vi.fn(), destroy: vi.fn() };
    view = { remove: vi.fn() };
    resizeTo: unknown;
    render = vi.fn();

    constructor(options: { resizeTo?: unknown } = {}) {
      this.resizeTo = options.resizeTo ?? null;
    }

    destroy(): void {}
  }

  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: MockGraphics,
    Renderer: MockRenderer,
    Sprite: MockSprite,
  };
});

vi.mock('pixi-viewport', () => ({
  Viewport: class {
    renderer = { width: 0, height: 0 };
    plugins = { pause: vi.fn(), resume: vi.fn() };

    drag(): this {
      return this;
    }

    wheel(): this {
      return this;
    }

    pinch(): this {
      return this;
    }

    decelerate(): this {
      return this;
    }

    addChild(): void {}

    update(): void {}

    resize(): void {}

    destroy(): void {}
  },
}));
