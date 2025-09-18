import { world } from "./world";

export function motionSystem(dt: number) {
  for (const e of world.all()) {
    if (e.vx == null || e.vy == null || e.x == null || e.y == null) continue;
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.sprite?.setPosition(e.x, e.y);
  }
}