import type { Entity } from "./components";

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
}

export const world = new WorldDB();