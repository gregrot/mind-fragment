import { world } from "./world";
import type { Entity } from "./components";

export const worldApi = {
  findNearest(from: Entity, tag: string) {
    const cands = world.byTag(tag);
    let best: Entity | null = null, bestD = Infinity;
    for (const e of cands) {
      if (e.x == null || e.y == null) continue;
      const dx = (from.x! - e.x), dy = (from.y! - e.y);
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  },
  moveTo(e: Entity, x: number, y: number) {
    // Simple target-as-velocity: aim and set velocity; MotionSystem will do the rest
    if (!e.vx && e.vx !== 0) e.vx = 0; if (!e.vy && e.vy !== 0) e.vy = 0;
    const dx = x - (e.x ?? 0), dy = y - (e.y ?? 0);
    const len = Math.hypot(dx, dy) || 1;
    const spd = Math.min(e.max ?? 50, 80);
    e.vx = (dx/len) * spd; e.vy = (dy/len) * spd;
  },
  pickup(from: Entity, tag = "scrap", amount = 1) {
    const near = this.findNearest(from, tag);
    if (!near) return false;
    // naive: if within 16px, "consume"
    const dist = Math.hypot((from.x??0)-(near.x??0), (from.y??0)-(near.y??0));
    if (dist > 16) return false;
    near.tags = (near.tags ?? []).filter(t => t !== tag); // despawn-ish
    from.items = from.items ?? {}; from.items[tag] = (from.items[tag] ?? 0) + amount;
    return true;
  },
  drop(from: Entity, tag = "scrap", amount = 1) {
    from.items = from.items ?? {}; from.items[tag] = Math.max(0, (from.items[tag] ?? 0) - amount);
  }
};