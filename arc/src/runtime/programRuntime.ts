import { StackInterpreter } from "@/blockkit/StackInterpreter";
import type { StackProgram } from "@/blockkit/types";
import { world } from "../world/world";
import { worldApi } from "../world/worldApi";
import {
  EntityId,
  EntityRole,
  Position,
  Program as ProgramComponent
} from "../world/components";

// Attach a lightweight adapter so block kinds call into worldApi
export function makeInterpreter() {
  const rt = new StackInterpreter({} as any);

  (rt as any).register?.("event.whenStarted", async (ctx: any) => {
    await ctx.runSlot("DO");
  });

  (rt as any).register?.("control.repeat", async (ctx: any) => {
    const n = (ctx.config?.times ?? 1) as number;
    for (let i = 0; i < n; i++) await ctx.runSlot("DO");
  });

  (rt as any).register?.("sense.findNearest", (ctx: any) => {
    const ent: EntityId = ctx.state.entity;
    ctx.state.lastResult = worldApi.findNearest(ent, ctx.config?.tag ?? "scrap");
  });

  (rt as any).register?.("sense.lastResult", (ctx: any) => ctx.state.lastResult);

  (rt as any).register?.("motion.moveTo", async (ctx: any) => {
    const ent: EntityId = ctx.state.entity;
    const role: EntityRole | undefined = ctx.config?.targetRole;
    let targetPos: { x: number; y: number } | null = null;

    if (role) {
      const targetId = world.firstByRole(role);
      if (targetId != null) {
        const pos = world.get(targetId, Position);
        if (pos) targetPos = pos;
      }
    } else if (ctx.config?.targetTag) {
      const targetId = world.byTag(ctx.config.targetTag)[0];
      if (targetId != null) {
        const pos = world.get(targetId, Position);
        if (pos) targetPos = pos;
      }
    } else {
      const target = ctx.getInput("target");
      if (typeof target === "number") {
        const pos = world.get(target as EntityId, Position);
        if (pos) targetPos = pos;
      } else if (target && typeof target === "object" && "x" in target && "y" in target) {
        targetPos = target as { x: number; y: number };
      }
    }

    if (!targetPos) return;
    worldApi.moveTo(ent, targetPos.x, targetPos.y);
  });

  (rt as any).register?.("manip.pickup", (ctx: any) => {
    const ent: EntityId = ctx.state.entity;
    worldApi.pickup(ent);
  });
  (rt as any).register?.("manip.drop", (ctx: any) => {
    const ent: EntityId = ctx.state.entity;
    worldApi.drop(ent);
  });
  (rt as any).register?.("manip.deposit", (ctx: any) => {
    const ent: EntityId = ctx.state.entity;
    const role: EntityRole | undefined = ctx.config?.targetRole;
    if (!role) return;
    worldApi.depositTo(ent, role);
  });

  return rt;
}

export function startProgram(entityId: EntityId, ast: StackProgram) {
  let program = world.get(entityId, ProgramComponent);
  if (!program) {
    program = { ast, running: true, budget: 8 };
    world.add(entityId, ProgramComponent, program);
  } else {
    program.ast = ast;
    program.running = true;
    program.budget = 8;
  }
}

export function stepPrograms(_dt: number) {
  for (const id of world.with(ProgramComponent)) {
    const program = world.get(id, ProgramComponent);
    if (!program?.running || !program.ast) continue;
    // For a real impl: call rt.run(ast) with a per-frame budget; here, pretend our blocks are instant side-effects
  }
}
