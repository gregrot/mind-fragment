import { Position, Sprite, Velocity } from "./components";
import { world } from "./world";

export function motionSystem(dt: number) {
  for (const id of world.with(Position, Velocity)) {
    const pos = world.get(id, Position)!;
    const vel = world.get(id, Velocity)!;
    pos.x += vel.vx * dt;
    pos.y += vel.vy * dt;
    const sprite = world.get(id, Sprite);
    sprite?.sprite.setPosition(pos.x, pos.y);
  }
}
