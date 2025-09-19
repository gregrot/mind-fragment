import { beforeEach, describe, expect, it } from "vitest";
import { worldApi } from "./worldApi";
import { world } from "./world";

describe("worldApi resource interactions", () => {
  beforeEach(() => {
    world.reset();
  });

  it("transfers required scrap from a robot to the assembler", () => {
    const robot = world.create({
      role: "robot",
      x: 0,
      y: 0,
      items: { scrap: 5 }
    });
    const assembler = world.create({
      role: "assembler",
      x: 0,
      y: 0,
      requires: { scrap: 3 }
    });

    const delivered = worldApi.depositTo(robot, "assembler");

    expect(delivered).toBe(true);
    expect(robot.items?.scrap).toBe(2);
    expect(assembler.requires?.scrap).toBe(0);
    expect(assembler.items?.scrap).toBe(3);
  });

  it("rejects deposits when the target is out of range", () => {
    const robot = world.create({ role: "robot", x: 0, y: 0, items: { scrap: 2 } });
    const assembler = world.create({
      role: "assembler",
      x: 100,
      y: 100,
      requires: { scrap: 2 }
    });

    const delivered = worldApi.depositTo(robot, "assembler");

    expect(delivered).toBe(false);
    expect(robot.items?.scrap).toBe(2);
    expect(assembler.requires?.scrap).toBe(2);
    expect(assembler.items?.scrap ?? 0).toBe(0);
  });

  it("delivers scrap to the mind fragment as energy", () => {
    const robot = world.create({ role: "robot", x: 0, y: 0, items: { scrap: 4 } });
    const mind = world.create({ role: "mind", x: 0, y: 0, cur: 2, cap: 5 });

    const delivered = worldApi.depositTo(robot, "mind");

    expect(delivered).toBe(true);
    expect(robot.items?.scrap).toBe(1);
    expect(mind.cur).toBe(5);
  });

  it("removes nearby scrap entities after pickup", () => {
    const robot = world.create({ role: "robot", x: 0, y: 0 });
    world.create({ role: "scrap", x: 8, y: 0, tags: ["scrap"] });

    const picked = worldApi.pickup(robot, "scrap");

    expect(picked).toBe(true);
    expect(robot.items?.scrap).toBe(1);
    expect(world.byTag("scrap")).toHaveLength(0);
  });
});
