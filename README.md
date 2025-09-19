# Mind Fragment — Rebuild Planning Set

This repository is the stripped-back planning space for rebooting Mind Fragment from the ground up. Only the design knowledge we want to carry forward survives here, rewritten where needed so it can guide the next playable version—starting with the block-based programming pillar.

## Using This Repository
- Start with the documents below to understand what we are keeping from the previous prototype and what still needs to be invented.
- Treat each document as living guidance; edit in place rather than scattering side notes so the history remains coherent.
- When you introduce a new idea, flag whether it is **Carry-over** (rooted in the old build) or **New Work** so we can see the evolution at a glance.

## Document Map

### Steering
- [Experience & Loop Direction](docs/steering/experience.md) — Narrative framing, opening sequence, and the layered play loops we are preserving as the north star.
- [Voice & Tone Sheet](docs/steering/voice-and-tone.md) — Dialogue direction and sample barks that keep the Mind Fragment’s personality intact while we rebuild systems.
- [Visual Asset Studies — Crash Zone Set](docs/steering/visual-assets.md) — Palette, silhouettes, animation hooks, and a render script for the opening crash-zone core, first worker drone, and local sporeling nest.
- [Block Runtime Integration Direction](docs/steering/block-runtime-integration.md) — ECS and behaviour-tree guidance that ties authored block programmes to robot behaviour and telemetry.

### Planning
- [Block Programming Plan](docs/planning/block-programming.md) — Architectural goals, player flow, and implementation priorities for the editor and runtime we need to recreate first.
- [Programmable Robot MVP Task List](docs/planning/programmable-robot-mvp.md) — Task breakdown for delivering a PixiJS-powered, modular robot sandbox that players can programme.

### Reference
- [Legacy BlockKit Notes](docs/reference/legacy-blockkit.md) — Snapshot of the prior technical stack that informs what we reuse, replace, or redesign.

## Block Builder Prototype
- Live React workspace under `src/` organised with Vite for quick iteration.
- Install dependencies with `npm install`, then launch the playground via `npm run dev` to explore block behaviours.
- Run the drag-and-drop regression pack with `npm test`; it covers palette drops, slot placement, and lateral moves.
- Palette now includes event anchors (When Started) and multi-branch control blocks (Parallel, Forever) so you can prototype branching flows quickly.
- The components mirror the schema described in [Block Programming Plan](docs/planning/block-programming.md), keeping DO / THEN / ELSE slots visible for planning discussions.

## Current Priorities
1. Finalise the block schema and runtime contract outlined in the planning document, keeping legacy capabilities in mind.
2. Sketch the rebuilt editor HUD and debugging affordances that support the experience beats in the steering notes.
3. Capture any additional narrative or systems guidance directly within the steering documents rather than spinning up new files.

Everything else from the old project has been retired on purpose. As we add code back in, keep this documentation alongside it so we can trace intent to implementation.
