import type { Entity, EntityRole } from "./components";

export class WorldDB {
  private nextId = 1;
  entities: Map<number, Entity> = new Map();

  create(e: Omit<Entity, "id">): Entity {
    const id = this.nextId++;
    const ent = { id, ...e } as Entity;
    this.entities.set(id, ent);
    return ent;
  }

  all() { return Array.from(this.entities.values()); }
  byTag(tag: string) { return this.all().filter(e => e.tags?.includes(tag)); }
  byRole(role: EntityRole) { return this.all().filter(e => e.role === role); }
  firstByRole(role: EntityRole) { return this.byRole(role)[0] ?? null; }
  destroy(id: number) { this.entities.delete(id); }
  reset() { this.entities.clear(); this.nextId = 1; }
}

export const world = new WorldDB();