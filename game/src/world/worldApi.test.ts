import { beforeEach, describe, expect, it } from "vitest";
import { worldApi } from "./worldApi";
import { world } from "./world";
import {
  Energy,
  Inventory,
  Position,
  Requirements,
  Role,
  Tags
} from "./components";

function makeRobot(scrap = 0) {
  const id = world.create();
  world.add(id, Role, "robot");
  world.add(id, Position, { x: 0, y: 0 });
  world.add(id, Inventory, scrap ? { scrap } : {});
  return id;
}

function makeAssembler(requirements: Record<string, number>, position = { x: 0, y: 0 }) {
  const id = world.create();
  world.add(id, Role, "assembler");
  world.add(id, Position, position);
  world.add(id, Requirements, { ...requirements });
  return id;
}

function makeMind(position = { x: 0, y: 0 }, energy = { cur: 0, cap: 0 }) {
  const id = world.create();
  world.add(id, Role, "mind");
  world.add(id, Position, position);
  world.add(id, Energy, { ...energy });
  return id;
}

describe("worldApi resource interactions", () => {
  beforeEach(() => {
    world.reset();
  });

  it("transfers required scrap from a robot to the assembler", () => {
    const robot = makeRobot(5);
    const assembler = makeAssembler({ scrap: 3 });

    const delivered = worldApi.depositTo(robot, "assembler");

    expect(delivered).toBe(true);
    expect(world.get(robot, Inventory)?.scrap).toBe(2);
    expect(world.get(assembler, Requirements)?.scrap).toBe(0);
    expect(world.get(assembler, Inventory)?.scrap).toBe(3);
  });

  it("rejects deposits when the target is out of range", () => {
    const robot = makeRobot(2);
    makeAssembler({ scrap: 2 }, { x: 100, y: 100 });

    const delivered = worldApi.depositTo(robot, "assembler");

    expect(delivered).toBe(false);
    expect(world.get(robot, Inventory)?.scrap).toBe(2);
  });

  it("delivers scrap to the mind fragment as energy", () => {
    const robot = makeRobot(4);
    const mind = makeMind({ x: 0, y: 0 }, { cur: 2, cap: 5 });

    const delivered = worldApi.depositTo(robot, "mind");

    expect(delivered).toBe(true);
    expect(world.get(robot, Inventory)?.scrap).toBe(1);
    expect(world.get(mind, Energy)?.cur).toBe(5);
  });

  it("removes nearby scrap entities after pickup", () => {
    const robot = makeRobot();
    const scrap = world.create();
    world.add(scrap, Role, "scrap");
    world.add(scrap, Position, { x: 8, y: 0 });
    world.add(scrap, Tags, ["scrap"]);

    const picked = worldApi.pickup(robot, "scrap");

    expect(picked).toBe(true);
    expect(world.get(robot, Inventory)?.scrap).toBe(1);
    expect(world.byTag("scrap")).toHaveLength(0);
  });
});
