export class Application {
  constructor() {
    this.renderer = { width: 0, height: 0, events: {} };
    this.ticker = { add: () => {}, remove: () => {} };
    this.stage = { addChild: () => {} };
    this.canvas = {};
  }

  async init() {
    return this;
  }

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
