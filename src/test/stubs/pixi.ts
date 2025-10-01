export class Application {
  renderer = new Renderer();
  ticker = { add: () => {}, remove: () => {} };
  stage = { addChild: () => {}, destroy: () => {} };
  view = { remove: () => {} };
  resizeTo: unknown;

  constructor(options: { resizeTo?: unknown } = {}) {
    this.resizeTo = options.resizeTo ?? null;
  }

  render(): void {}

  destroy(): void {}
}

export class Container {
  children: unknown[] = [];

  addChild<T>(child: T): T {
    this.children.push(child);
    return child;
  }

  removeChild<T>(child: T): T {
    this.children = this.children.filter((entry) => entry !== child);
    return child;
  }

  destroy(): void {}
}

export class Graphics extends Container {
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

export class Renderer {
  width = 0;
  height = 0;
  events: Record<string, unknown> = {};

  generateTexture(): { destroy: () => void } {
    return { destroy: () => {} };
  }

  destroy(): void {}
}

export class Sprite extends Container {
  anchor = {
    x: 0,
    y: 0,
    set: (x: number, y?: number) => {
      this.anchor.x = x;
      this.anchor.y = y ?? x;
    },
  };
  position = {
    x: 0,
    y: 0,
    set: (x: number, y: number) => {
      this.position.x = x;
      this.position.y = y;
    },
  };
  scale = {
    x: 1,
    y: 1,
    set: (x: number, y?: number) => {
      this.scale.x = x;
      this.scale.y = y ?? x;
    },
  };
  alpha = 1;
  rotation = 0;

  constructor(public texture?: unknown) {
    super();
    this.texture = texture;
  }

  destroy(): void {}
}
