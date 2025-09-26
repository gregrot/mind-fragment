export type ModuleActionHandler = (payload: unknown, context: unknown) => unknown;

type QueueActuator = (moduleId: string, channel: string, payload: unknown, priority?: number) => void;

interface ValueEntry {
  value: unknown;
  metadata: Record<string, unknown>;
  revision: number;
}

interface ActionEntry {
  handler: ModuleActionHandler;
  metadata: Record<string, unknown>;
  revision: number;
}

type ValueRegistry = Map<string, ValueEntry>;
type ActionRegistry = Map<string, ActionEntry>;

export class ModulePort {
  constructor(
    private readonly moduleId: string,
    private readonly bus: ModuleBus,
    private readonly queueActuator: (channel: string, payload: unknown, priority?: number) => void,
  ) {}

  publishValue(key: string, initialValue: unknown, metadata: Record<string, unknown> = {}): unknown {
    this.bus.publishValue(this.moduleId, key, initialValue, metadata);
    return initialValue;
  }

  updateValue(key: string, nextValue: unknown): unknown {
    this.bus.updateValue(this.moduleId, key, nextValue);
    return nextValue;
  }

  getValue<TValue = unknown>(key: string): TValue | undefined {
    return this.bus.getValue<TValue>(this.moduleId, key);
  }

  registerAction(
    name: string,
    handler: ModuleActionHandler,
    metadata: Record<string, unknown> = {},
  ): void {
    this.bus.registerAction(this.moduleId, name, handler, metadata);
  }

  unregisterAction(name: string): void {
    this.bus.unregisterAction(this.moduleId, name);
  }

  requestActuator(channel: string, payload: unknown, priority = 0): void {
    this.queueActuator(channel, payload, priority);
  }
}

export interface ValuesSnapshot {
  [moduleId: string]: {
    [key: string]: ValueEntry;
  };
}

export interface ActionsSnapshot {
  [moduleId: string]: {
    [name: string]: Pick<ActionEntry, 'metadata' | 'revision'>;
  };
}

export class ModuleBus {
  private readonly values = new Map<string, ValueRegistry>();
  private readonly actions = new Map<string, ActionRegistry>();
  private readonly ports = new Map<string, ModulePort>();
  private revision = 0;

  registerModule(moduleId: string, queueActuator: QueueActuator): ModulePort {
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

  unregisterModule(moduleId: string): void {
    this.values.delete(moduleId);
    this.actions.delete(moduleId);
    this.ports.delete(moduleId);
  }

  publishValue(moduleId: string, key: string, value: unknown, metadata: Record<string, unknown>): void {
    const registry = this.values.get(moduleId);
    if (!registry) {
      throw new Error(`Module ${moduleId} is not registered.`);
    }
    if (registry.has(key)) {
      throw new Error(`Module ${moduleId} has already published value ${key}.`);
    }
    registry.set(key, { value, metadata, revision: ++this.revision });
  }

  updateValue(moduleId: string, key: string, value: unknown): void {
    const registry = this.values.get(moduleId);
    if (!registry || !registry.has(key)) {
      throw new Error(`Module ${moduleId} has not published value ${key}.`);
    }
    const entry = registry.get(key);
    if (!entry) {
      throw new Error(`Module ${moduleId} has not published value ${key}.`);
    }
    registry.set(key, {
      ...entry,
      value,
      revision: ++this.revision,
    });
  }

  getValue<TValue = unknown>(moduleId: string, key: string): TValue | undefined {
    const registry = this.values.get(moduleId);
    return registry?.get(key)?.value as TValue | undefined;
  }

  registerAction(
    moduleId: string,
    name: string,
    handler: ModuleActionHandler,
    metadata: Record<string, unknown>,
  ): void {
    const registry = this.actions.get(moduleId);
    if (!registry) {
      throw new Error(`Module ${moduleId} is not registered.`);
    }
    if (registry.has(name)) {
      throw new Error(`Module ${moduleId} already registered action ${name}.`);
    }
    registry.set(name, { handler, metadata, revision: ++this.revision });
  }

  unregisterAction(moduleId: string, name: string): void {
    const registry = this.actions.get(moduleId);
    if (!registry || !registry.has(name)) {
      return;
    }
    registry.delete(name);
  }

  getAction(moduleId: string, name: string): ActionEntry | null {
    const registry = this.actions.get(moduleId);
    return registry?.get(name) ?? null;
  }

  getPort(moduleId: string): ModulePort | null {
    return this.ports.get(moduleId) ?? null;
  }

  getValuesSnapshot(): ValuesSnapshot {
    const snapshot: ValuesSnapshot = {};
    for (const [moduleId, registry] of this.values.entries()) {
      snapshot[moduleId] = {};
      for (const [key, entry] of registry.entries()) {
        snapshot[moduleId][key] = { ...entry };
      }
    }
    return snapshot;
  }

  getActionsSnapshot(): ActionsSnapshot {
    const snapshot: ActionsSnapshot = {};
    for (const [moduleId, registry] of this.actions.entries()) {
      snapshot[moduleId] = {};
      for (const [name, entry] of registry.entries()) {
        snapshot[moduleId][name] = { metadata: entry.metadata, revision: entry.revision };
      }
    }
    return snapshot;
  }
}
