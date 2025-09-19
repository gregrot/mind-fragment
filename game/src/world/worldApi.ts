import { world } from "./world";
import {
  Energy,
  EntityId,
  EntityRole,
  Inventory,
  Position,
  Requirements,
  Sprite,
  Tags,
  Velocity
} from "./components";

function ensureInventory(id: EntityId) {
  let inv = world.get(id, Inventory);
  if (!inv) {
    inv = {};
    world.add(id, Inventory, inv);
  }
  return inv;
}

export const worldApi = {
  findNearest(fromId: EntityId, tag: string) {
    const origin = world.get(fromId, Position);
    if (!origin) return null;
    let best: EntityId | null = null;
    let bestDist = Infinity;
    for (const id of world.byTag(tag)) {
      const pos = world.get(id, Position);
      if (!pos) continue;
      const dx = origin.x - pos.x;
      const dy = origin.y - pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = id;
      }
    }
    return best;
  },

  moveTo(entityId: EntityId, x: number, y: number) {
    const pos = world.get(entityId, Position);
    const vel = world.get(entityId, Velocity);
    if (!pos || !vel) return;
    const dx = x - pos.x;
    const dy = y - pos.y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = Math.min(vel.max ?? 50, 80);
    vel.vx = (dx / len) * speed;
    vel.vy = (dy / len) * speed;
  },

  pickup(fromId: EntityId, tag = "scrap", amount = 1) {
    const origin = world.get(fromId, Position);
    if (!origin) return false;
    const nearId = this.findNearest(fromId, tag);
    if (nearId == null) return false;
    const targetPos = world.get(nearId, Position);
    if (!targetPos) return false;
    const dist = Math.hypot(origin.x - targetPos.x, origin.y - targetPos.y);
    if (dist > 16) return false;

    let shouldDestroy = true;
    const tags = world.get(nearId, Tags);
    if (tags) {
      const filtered = tags.filter(t => t !== tag);
      if (filtered.length) {
        world.add(nearId, Tags, filtered);
        shouldDestroy = false;
      } else {
        world.remove(nearId, Tags);
      }
    }

    const sprite = world.get(nearId, Sprite);
    sprite?.sprite.destroy();
    if (shouldDestroy) {
      world.destroy(nearId);
    }

    const inv = ensureInventory(fromId);
    inv[tag] = (inv[tag] ?? 0) + amount;
    return true;
  },

  drop(fromId: EntityId, tag = "scrap", amount = 1) {
    const inv = world.get(fromId, Inventory);
    if (!inv) return;
    inv[tag] = Math.max(0, (inv[tag] ?? 0) - amount);
  },

  depositTo(fromId: EntityId, targetRole: EntityRole) {
    const targetId = world.firstByRole(targetRole);
    if (targetId == null) return false;
    const fromPos = world.get(fromId, Position);
    const targetPos = world.get(targetId, Position);
    if (!fromPos || !targetPos) return false;
    const dist = Math.hypot(fromPos.x - targetPos.x, fromPos.y - targetPos.y);
    if (dist > 28) return false;

    const inv = world.get(fromId, Inventory);
    if (!inv) return false;

    let changed = false;

    if (targetRole === "assembler") {
      let needs = world.get(targetId, Requirements);
      if (!needs) {
        needs = {};
        world.add(targetId, Requirements, needs);
      }
      const cargo = ensureInventory(targetId);
      for (const key of Object.keys(needs)) {
        const need = needs[key] ?? 0;
        if (need <= 0) continue;
        const have = inv[key] ?? 0;
        if (have <= 0) continue;
        const delivered = Math.min(need, have);
        inv[key] = have - delivered;
        needs[key] = need - delivered;
        cargo[key] = (cargo[key] ?? 0) + delivered;
        changed = true;
      }
    } else if (targetRole === "mind") {
      const scrap = inv["scrap"] ?? 0;
      const energy = world.get(targetId, Energy);
      if (!energy) return false;
      const cap = energy.cap ?? energy.cur;
      const free = Math.max(0, cap - (energy.cur ?? 0));
      const delivered = Math.min(scrap, free);
      if (delivered > 0) {
        inv["scrap"] = scrap - delivered;
        energy.cur = (energy.cur ?? 0) + delivered;
        changed = true;
      }
    }

    return changed;
  }
};
