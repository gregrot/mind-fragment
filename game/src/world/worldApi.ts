import { world } from "./world";
import type { Entity, EntityRole } from "./components";

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
    near.sprite?.destroy();
    if (!near.tags?.length) world.destroy(near.id);
    from.items = from.items ?? {}; from.items[tag] = (from.items[tag] ?? 0) + amount;
    return true;
  },
  drop(from: Entity, tag = "scrap", amount = 1) {
    from.items = from.items ?? {}; from.items[tag] = Math.max(0, (from.items[tag] ?? 0) - amount);
  },
  depositTo(from: Entity, targetRole: EntityRole) {
    const target = world.firstByRole(targetRole);
    if (!target) return false;
    if (from.x == null || from.y == null || target.x == null || target.y == null) return false;
    const dist = Math.hypot(from.x - target.x, from.y - target.y);
    if (dist > 28) return false;

    from.items = from.items ?? {};
    let changed = false;

    if (targetRole === "assembler") {
      target.requires = target.requires ?? {};
      target.items = target.items ?? {};
      for (const key of Object.keys(target.requires)) {
        const need = target.requires[key] ?? 0;
        if (need <= 0) continue;
        const have = from.items[key] ?? 0;
        if (have <= 0) continue;
        const delivered = Math.min(need, have);
        from.items[key] = have - delivered;
        target.requires[key] = need - delivered;
        target.items[key] = (target.items[key] ?? 0) + delivered;
        changed = true;
      }
    } else if (targetRole === "mind") {
      const scrap = from.items["scrap"] ?? 0;
      if ((target.cur ?? null) != null) {
        const cap = target.cap ?? target.cur ?? 0;
        const free = Math.max(0, cap - (target.cur ?? 0));
        const delivered = Math.min(scrap, free);
        if (delivered > 0) {
          from.items["scrap"] = scrap - delivered;
          target.cur = (target.cur ?? 0) + delivered;
          changed = true;
        }
      }
    }

    return changed;
  }
};