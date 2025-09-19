class ModulePort {
  constructor(moduleId, bus, queueActuator) {
    this.moduleId = moduleId;
    this.bus = bus;
    this.queueActuator = queueActuator;
  }

  publishValue(key, initialValue, metadata = {}) {
    this.bus.publishValue(this.moduleId, key, initialValue, metadata);
    return initialValue;
  }

  updateValue(key, nextValue) {
    this.bus.updateValue(this.moduleId, key, nextValue);
    return nextValue;
  }

  getValue(key) {
    return this.bus.getValue(this.moduleId, key);
  }

  registerAction(name, handler, metadata = {}) {
    this.bus.registerAction(this.moduleId, name, handler, metadata);
  }

  unregisterAction(name) {
    this.bus.unregisterAction(this.moduleId, name);
  }

  requestActuator(channel, payload, priority = 0) {
    this.queueActuator(channel, payload, priority);
  }
}

export class ModuleBus {
  constructor() {
    this.values = new Map();
    this.actions = new Map();
    this.ports = new Map();
    this.revision = 0;
  }

  registerModule(moduleId, queueActuator) {
    if (this.ports.has(moduleId)) {
      throw new Error(`Module ${moduleId} already registered with bus.`);
    }
    this.values.set(moduleId, new Map());
    this.actions.set(moduleId, new Map());
    const port = new ModulePort(
      moduleId,
      this,
      (channel, payload, priority) => queueActuator(moduleId, channel, payload, priority),
    );
    this.ports.set(moduleId, port);
    return port;
  }

  unregisterModule(moduleId) {
    this.values.delete(moduleId);
    this.actions.delete(moduleId);
    this.ports.delete(moduleId);
  }

  publishValue(moduleId, key, value, metadata) {
    const registry = this.values.get(moduleId);
    if (!registry) {
      throw new Error(`Module ${moduleId} is not registered.`);
    }
    if (registry.has(key)) {
      throw new Error(`Module ${moduleId} has already published value ${key}.`);
    }
    registry.set(key, { value, metadata, revision: ++this.revision });
  }

  updateValue(moduleId, key, value) {
    const registry = this.values.get(moduleId);
    if (!registry || !registry.has(key)) {
      throw new Error(`Module ${moduleId} has not published value ${key}.`);
    }
    registry.set(key, {
      ...registry.get(key),
      value,
      revision: ++this.revision,
    });
  }

  getValue(moduleId, key) {
    const registry = this.values.get(moduleId);
    return registry?.get(key)?.value;
  }

  registerAction(moduleId, name, handler, metadata) {
    const registry = this.actions.get(moduleId);
    if (!registry) {
      throw new Error(`Module ${moduleId} is not registered.`);
    }
    if (registry.has(name)) {
      throw new Error(`Module ${moduleId} already registered action ${name}.`);
    }
    registry.set(name, { handler, metadata, revision: ++this.revision });
  }

  unregisterAction(moduleId, name) {
    const registry = this.actions.get(moduleId);
    if (!registry || !registry.has(name)) {
      return;
    }
    registry.delete(name);
  }

  getAction(moduleId, name) {
    const registry = this.actions.get(moduleId);
    return registry?.get(name) ?? null;
  }

  getPort(moduleId) {
    return this.ports.get(moduleId) ?? null;
  }

  getValuesSnapshot() {
    const snapshot = {};
    for (const [moduleId, registry] of this.values.entries()) {
      snapshot[moduleId] = {};
      for (const [key, entry] of registry.entries()) {
        snapshot[moduleId][key] = {
          value: entry.value,
          metadata: entry.metadata,
          revision: entry.revision,
        };
      }
    }
    return snapshot;
  }

  getActionsSnapshot() {
    const snapshot = {};
    for (const [moduleId, registry] of this.actions.entries()) {
      snapshot[moduleId] = {};
      for (const [name, entry] of registry.entries()) {
        snapshot[moduleId][name] = {
          metadata: entry.metadata,
          revision: entry.revision,
        };
      }
    }
    return snapshot;
  }
}
