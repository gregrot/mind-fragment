import type { ComponentType, EntityId, EntityRole } from "./components";
import { Role, Tags } from "./components";

export class World {
  private nextId: EntityId = 1;
  private readonly alive = new Set<EntityId>();
  private readonly stores = new Map<symbol, Map<EntityId, unknown>>();

  private ensureStore<T>(component: ComponentType<T>): Map<EntityId, T> {
    let store = this.stores.get(component.key) as Map<EntityId, T> | undefined;
    if (!store) {
      store = new Map<EntityId, T>();
      this.stores.set(component.key, store);
    }
    return store;
  }

  private getStore<T>(component: ComponentType<T>): Map<EntityId, T> | undefined {
    return this.stores.get(component.key) as Map<EntityId, T> | undefined;
  }

  private assertAlive(id: EntityId) {
    if (!this.alive.has(id)) {
      throw new Error(`Entity ${id} is not alive`);
    }
  }

  create(initial: Iterable<[ComponentType<any>, any]> = []): EntityId {
    const id = this.nextId++;
    this.alive.add(id);
    for (const [component, value] of initial) {
      this.add(id, component, value);
    }
    return id;
  }

  destroy(id: EntityId) {
    if (!this.alive.delete(id)) return;
    for (const store of this.stores.values()) {
      store.delete(id);
    }
  }

  reset() {
    this.alive.clear();
    this.stores.clear();
    this.nextId = 1;
  }

  add<T>(id: EntityId, component: ComponentType<T>, value: T): T {
    this.assertAlive(id);
    this.ensureStore(component).set(id, value);
    return value;
  }

  get<T>(id: EntityId, component: ComponentType<T>): T | undefined {
    const store = this.getStore(component);
    return store?.get(id);
  }

  has<T>(id: EntityId, component: ComponentType<T>): boolean {
    const store = this.getStore(component);
    return store?.has(id) ?? false;
  }

  remove<T>(id: EntityId, component: ComponentType<T>) {
    const store = this.getStore(component);
    store?.delete(id);
  }

  entities(): EntityId[] {
    return Array.from(this.alive.values());
  }

  with(...components: ComponentType<any>[]): EntityId[] {
    if (components.length === 0) {
      return this.entities();
    }
    const [first, ...rest] = components;
    const base = this.getStore(first);
    if (!base) return [];
    const results: EntityId[] = [];
    for (const id of base.keys()) {
      if (!this.alive.has(id)) continue;
      let ok = true;
      for (const component of rest) {
        if (!this.has(id, component)) {
          ok = false;
          break;
        }
      }
      if (ok) results.push(id);
    }
    return results;
  }

  byTag(tag: string): EntityId[] {
    return this.with(Tags).filter(id => {
      const tags = this.get(id, Tags);
      return tags ? tags.includes(tag) : false;
    });
  }

  byRole(role: EntityRole): EntityId[] {
    return this.with(Role).filter(id => this.get(id, Role) === role);
  }

  firstByRole(role: EntityRole): EntityId | null {
    return this.byRole(role)[0] ?? null;
  }
}

export const world = new World();
