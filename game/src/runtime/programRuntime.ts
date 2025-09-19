import { StackInterpreter } from "../../../blockkit-ts/src/scratch/StackInterpreter";
import type { StackProgram } from "../../../blockkit-ts/src/scratch/stackTypes";
import { world } from "../world/world";
import { worldApi } from "../world/worldApi";
import type { Entity, EntityRole } from "../world/components";

// Attach a lightweight adapter so block kinds call into worldApi
export function makeInterpreter() {
  const rt = new StackInterpreter({} as any);

  // Register handlers matching your block kinds
  // event.whenStarted → just run DO slot
  (rt as any).register?.("event.whenStarted", async (ctx: any) => { await ctx.runSlot("DO"); });

  (rt as any).register?.("control.repeat", async (ctx: any) => {
    const n = (ctx.config?.times ?? 1) as number;
    for (let i=0;i<n;i++) await ctx.runSlot("DO");
  });

  (rt as any).register?.("sense.findNearest", (ctx: any) => {
    const ent: Entity = ctx.state.entity;
    ctx.state.lastResult = worldApi.findNearest(ent, ctx.config?.tag ?? "scrap");
  });

  (rt as any).register?.("sense.lastResult", (ctx: any) => ctx.state.lastResult);

  (rt as any).register?.("motion.moveTo", async (ctx: any) => {
    const ent: Entity = ctx.state.entity;
    const role: EntityRole | undefined = ctx.config?.targetRole;
    const target = role
      ? world.firstByRole(role)
      : ctx.config?.targetTag
        ? world.byTag(ctx.config.targetTag)[0]
        : ctx.getInput("target");
    if (!target) return;
    const pos = (target as any).x != null ? target : { x: (target as any).x, y: (target as any).y };
    worldApi.moveTo(ent, (pos as any).x, (pos as any).y);
  });

  (rt as any).register?.("manip.pickup", (ctx: any) => {
    const ent: Entity = ctx.state.entity; worldApi.pickup(ent);
  });
  (rt as any).register?.("manip.drop", (ctx: any) => {
    const ent: Entity = ctx.state.entity; worldApi.drop(ent);
  });
  (rt as any).register?.("manip.deposit", (ctx: any) => {
    const ent: Entity = ctx.state.entity;
    const role: EntityRole | undefined = ctx.config?.targetRole;
    if (!role) return;
    worldApi.depositTo(ent, role);
  });

  return rt;
}

export function startProgram(e: Entity, ast: StackProgram) {
  e.running = true; e.budget = 8; // ticks per frame
  // Thread model: run() returns a handle you step each frame; if your StackInterpreter is fully async, adapt here
  (e as any)._program = { ast, ip: ast.heads[0] ?? null };
}

export function stepPrograms(_dt: number) {
  for (const e of world.all()) {
    if (!e.running || !e.ast) continue;
    // For a real impl: call rt.run(ast) with a per-frame budget; here, pretend our blocks are instant side-effects
  }
}