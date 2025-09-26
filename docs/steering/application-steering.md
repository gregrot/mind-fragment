# Application Steering Guide

## Intent
Mind Fragment is a block-programming-first sandbox where the player repairs and extends semi-autonomous field mechanisms. The interface pairs a live Pixi-powered simulation with a workspace for assembling logic from reusable blocks. This document anchors how the rebuilt application should feel and behave so new features reinforce the core loop instead of fragmenting it.

- **Player promise**: you can always see a mechanism, inspect its systems, and change its programme without losing situational awareness.
- **Tone**: pragmatic survivalism with dry humour. Dialogue and UI copy should be concise, with flavour emerging from sparing narrative barks rather than verbose exposition.
- **Rhythm**: short iterations. Encourage tweaks, deploy them instantly, observe telemetry, and iterate.

## Player Flow
### Boot and framing
1. Load the simulation shell. The Pixi scene initialises automatically and spawns the default chassis **MF-01**.
2. Autostart the default programme once the scene is ready so the world never appears inert.
3. Keep onboarding optional. The `ONBOARDING_ENABLED` flag is currently `false`; when reintroducing tutorials, gate them behind this switch so returning players stay unblocked.

### Programming loop
1. **Select a mechanism** in the simulation or via the overlay list. Selection updates `simulationRuntime` and surfaces the relevant inspectors.
2. **Author logic** in the block workspace. Blocks come from the palette (`BLOCK_MAP`) and are arranged through drag-and-drop using drop targets for DO / THEN / ELSE slots.
3. **Configure parameters** inline. Numeric and signal fields open lightweight editors; parameter drags stay scoped to their owner block to prevent stray drops.
4. **Deploy** by pressing run in the runtime controls. Programmes compile into ECS actions and stream to the Pixi world via `simulationRuntime.runProgram`.
5. **Observe** telemetry and overlay readouts. Adjustments should be possible mid-run; we reconcile workspace changes with the active mechanism state when the player presses run again.

### Inspection and loadouts
- **Entity overlay**: opens automatically when a mechanism or module is focused. Tabs default to **Systems** for complex overlays and **Info** for simple records.
- **Chassis view**: mirrors slot capacity from `ChassisSnapshot`, allowing drag rearrangement within the overlay.
- **Inventory view**: normalises slots to a minimum capacity of 10, padding with empty stackable slots so the grid never collapses as resources fluctuate.
- **Program state**: show compile status and runtime feedback (`ProgramRunnerStatus`). Communicate blocking errors with clear calls to action—avoid silent failures.

## Core Systems
### Simulation Shell (Pixi)
- Initialises once per app load and resizes with the viewport.
- Registers the `RootScene` with `simulationRuntime` so programme updates, inventory deltas, and telemetry stream bidirectionally.
- Mechanism selection events propagate through `RootScene.subscribeMechanismSelection`, which keeps the overlay and workspace in sync.

### Block Workspace
- `useBlockWorkspace` manages in-memory programmes. Palette drops create fresh instances via `createBlockInstance`; workspace drops reparent existing blocks while preventing ancestral loops.
- Workspace state is serialisable. Persist per mechanism so players can hot-swap between machines without losing drafts.
- Start blocks remain the anchor. When absent, highlight the first block so the user understands execution order will be undefined.

### Entity Overlay Manager
- Centralises overlay state, including optimistic persistence handling. Listeners receive `change`, `save-*`, and retry events.
- `openOverlay` records the selected entity and optionally the active tab. Closing the overlay should clear selection unless a mechanism stays targeted in the scene.
- Persisted overlays must debounce writes; use `schedulePersistence` to consolidate rapid edits.

### Simulation Runtime
- Maintains cached snapshots for inventory, chassis, programme status, and telemetry per mechanism.
- Automatically injects the default programme for the default mechanism once per session to keep the scene active.
- Exposes subscription helpers (`subscribeInventory`, `subscribeChassis`, `subscribeTelemetry`, `subscribeStatus`) for React hooks to bind UI components.

## Interaction Principles
- **Direct manipulation first**: prefer drag handles, inline dropdowns, and toggles to modal dialogues.
- **Readable debugging**: telemetry panes should label values with human terms (e.g. *Battery Output* instead of `battery_output`). Provide quick filters for signals vs. actions.
- **Fail soft**: if persistence or compilation fails, surface the error inline and keep the player’s edits in memory for retry.
- **Keyboard parity**: ensure block selection and deletion are accessible via keyboard shortcuts to support long-form programming sessions.

## Carry-over vs New Work
> **Carry-over**: the block programming grammar, inventory slotting model, and Pixi scene management remain from the prior prototype.
>
> **New Work**: refactor onboarding, telemetry presentation, and programme persistence with cloud saves in mind. Prioritise deterministic simulation playback so designers can reproduce bugs reliably.

## Outstanding Questions
- What narrative wrappers do we surface during the first boot sequence now that onboarding is disabled?
- How many concurrent mechanisms should the workspace manage before we introduce pagination or grouping?
- Which telemetry channels matter most for early playtests (e.g. power draw, positional data, enemy detection)?

Use these prompts to scope upcoming stories; update this document as answers solidify so the entire team shares the same north star.
