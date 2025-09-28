# Mind Fragment Roadmap

## Delivery Principles
- Anchor every milestone around playable feedback. Each phase should end with something the team can run, poke, and critique.
- Preserve the block-programming-first workflow; new systems must report back into the block workspace or entity overlay to remain discoverable.
- Document intent as soon as it lands. Update this roadmap and the steering guide whenever priorities shift so downstream contributors stay aligned.

## Phase 1 — Simulation & Programming Cohesion
**Objective**: consolidate the existing Pixi simulation, mechanism overlay, and block workspace into a reliable authoring loop.

- ✅ Stabilise the Pixi shell initialisation and teardown lifecycle (covered by `SimulationShell`).
- ✅ Maintain per-mechanism workspace state in React so switching entities retains draft programmes.
- 🚧 Surface runtime compile errors inline in the overlay using `ProgramRunnerStatus`.
- 🚧 Persist overlay edits optimistically and implement retry flows via `EntityOverlayManager` events.
- 📌 Audit drag-and-drop affordances for accessibility (keyboard focus, ARIA labelling, and touch targets).
- ✅ Capture the tree-harvesting recipe (`Forever → Scan Area → Move To → Use Tool Slot → Gather Resource → Deposit Cargo / Wait`) so designers can script the new automation path.

## Phase 2 — Telemetry & Debugging
**Objective**: make the consequences of a programme obvious by expanding telemetry capture and visualisation.

- 🚧 Extend `simulationRuntime.subscribeTelemetry` consumers with grouped channels (Power, Navigation, Threats).
- 📌 Add timeline scrubbing for recent telemetry snapshots to aid debugging.
- 📌 Introduce breakpoint blocks or conditional pauses to let designers inspect world state mid-run.
- 📌 Publish a diagnostics overlay that cross-references inventory, chassis capacity, and queued actions for the selected mechanism.

## Phase 3 — World Growth & Narrative Hooks
**Objective**: add context so the crash-site feels alive while keeping focus on programmable systems.

- 📌 Re-enable onboarding through the `ONBOARDING_ENABLED` gate with a streamlined three-step tutorial.
- 📌 Populate the scene with interactive points (e.g. resource nodes, hazards) driven by ECS components so block programmes have meaningful targets.
- 📌 Layer narrative prompts triggered by telemetry events—short, flavourful callouts that respect the tone described in the steering guide.
- 📌 Prototype cooperative tasks requiring multiple mechanisms to share inventory or chained programmes.

## Phase 4 — Persistence & Sharing
**Objective**: support longer sessions and collaboration without breaking the tight iteration loop.

- 📌 Persist mechanism configurations (chassis slots, inventory assignments, block programmes) to a storage backend.
- 📌 Implement save slots or timeline branches so players can experiment and roll back.
- 📌 Add export/import for programmes in a human-readable JSON format compatible with `WorkspaceState`.
- 📌 Explore cloud-sharing hooks so designers can distribute canonical challenge setups.

## Maintenance Backlog
These items remain important but should be scheduled once the above phases are underway:

- Improve automated coverage for drag-and-drop logic (`useBlockWorkspace` and drop utilities).
- Profile Pixi rendering under heavy entity counts; tune asset streaming via `assetService` to prevent stalls.
- Replace placeholder art with a production-ready asset pipeline once the simulation loop stabilises.
- Review dependency updates quarterly to keep Vite, React, and Pixi security patches current.

Update progress markers (`✅`, `🚧`, `📌`) as work advances. Treat this roadmap as a living document; prune or extend phases when playtest feedback reveals new priorities.
