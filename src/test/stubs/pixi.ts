export class Application {
  renderer = {
    width: 0,
    height: 0,
    events: {},
    generateTexture: () => ({ destroy: () => {} }),
  };
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
  addChild(): void {}
  removeChild(): void {}
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

export class Sprite extends Container {
  anchor = { set: () => {} };
  position = { set: () => {} };
  rotation = 0;
}
