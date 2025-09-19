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

  class MockContainer {
    children: unknown[] = [];

    addChild<T>(child: T): T {
      this.children.push(child);
      return child;
    }

    removeChild<T>(child: T): void {
      this.children = this.children.filter((entry) => entry !== child);
    }
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
    anchor = { set: vi.fn() };
    position = { set: vi.fn() };
    rotation = 0;
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
