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
- [Mechanism Module System Exploration](docs/planning/mechanism-module-system.md) — Terminology shift from robots to mechanisms, module family definitions, prefab strategy, chaining behaviours, and technology tree planning.
- [Robot Overlay, Chassis, and Inventory Spec](docs/planning/robot-overlay-and-inventory.md) — Interaction spec covering the rebuilt inspector overlay, chassis slots, inventory rules, and drag-and-drop behaviour.
- [ECS Blackboard Planning Notes](docs/planning/simulation/ecs-blackboard.md) — Survey of lightweight blackboard patterns and the facts/events our ECS runtime should expose.
- [Release Notes — Parameterised Block Editor](docs/planning/release-notes.md) — Running log of editor/runtime shifts so downstream tasks inherit the latest schema expectations.

### Reference
- [Legacy BlockKit Notes](docs/reference/legacy-blockkit.md) — Snapshot of the prior technical stack that informs what we reuse, replace, or redesign.

## Block Builder Prototype
- Live React workspace under `src/` organised with Vite for quick iteration.
- Install dependencies with `npm install`, then launch the playground via `npm run dev` to explore block behaviours.
- Run the regression pack with `npm test` and `npm run typecheck` to catch unit and typing slips.
- Execute targeted Playwright flows with `npx playwright test playwright/block-workspace.spec.ts` to confirm literal editing, signal selection, and operator nesting remain stable.
- Palette now includes event anchors (When Started) and multi-branch control blocks (Parallel, Forever) so you can prototype branching flows quickly.
- The components mirror the schema described in [Block Programming Plan](docs/planning/block-programming.md), keeping DO / THEN / ELSE slots visible for planning discussions.

### Self-hosted font setup
The sci-fi theme references Orbitron and Rajdhani via local `@font-face` rules, but the font binaries are intentionally left out of source control. To install them locally:

1. Download Orbitron and Rajdhani from [Google Fonts](https://fonts.google.com/). Include the Regular (400) and Bold (700) weights for each family when exporting.
2. Unzip the downloads and copy the `.ttf` files into `src/styles/fonts/`, renaming them to match the expected filenames used by the theme:
   - `src/styles/fonts/Orbitron-Regular.ttf`
   - `src/styles/fonts/Orbitron-Bold.ttf`
   - `src/styles/fonts/Rajdhani-Regular.ttf`
   - (optional) swap in a heavier Rajdhani variant by updating `src/styles/theme.css` — the default build maps the 700 weight to the regular file so pipelines succeed without an extra binary.
3. Restart `npm run dev` so Vite picks up the new assets. The UI will fall back to system fonts if the files are absent, so you can still develop without them.

## Current Priorities
1. Finalise the block schema and runtime contract outlined in the planning document, keeping legacy capabilities in mind.
2. Sketch the rebuilt editor HUD and debugging affordances that support the experience beats in the steering notes.
3. Capture any additional narrative or systems guidance directly within the steering documents rather than spinning up new files.

Everything else from the old project has been retired on purpose. As we add code back in, keep this documentation alongside it so we can trace intent to implementation.
