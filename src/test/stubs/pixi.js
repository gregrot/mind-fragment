export class Application {
  constructor(options = {}) {
    this.renderer = {
      width: 0,
      height: 0,
      events: {},
      generateTexture: () => ({ destroy: () => {} }),
    };
    this.ticker = { add: () => {}, remove: () => {} };
    this.stage = { addChild: () => {}, destroy: () => {} };
    this.view = { remove: () => {} };
    this.resizeTo = options.resizeTo ?? null;
  }

  render() {}

  destroy() {}
}

export class Container {
  addChild() {}
  removeChild() {}
}

export class Graphics extends Container {
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

export class Sprite extends Container {
  constructor() {
    super();
    this.anchor = { set: () => {} };
    this.position = { set: () => {} };
    this.rotation = 0;
  }
}
