# Block Runtime Integration Direction

This steering note stitches the block authoring experience to in-world robot behaviour so the Mind Fragment rebuild keeps the block canvas, simulation, and narrative consequences in lockstep.

## Reset Context
- **Carry-over:** Retain the shared programme scheduler, module → block unlock flow, and heat/ethics feedback loops already defined in the block programming plan and experience notes.
- **New Work:** Treat each robot as an entity composed of modules inside an ECS runtime, and express block programmes as behaviour trees that publish intents other systems resolve.
- **New Work:** Align telemetry, debugging beacons, and ethical prompts with the behaviour tree lifecycle so the simulation shell mirrors what the editor reports.

## Integration Intent
1. **Block-first:** Programmes authored in the canvas remain the single source of truth; runtime structures exist to respect player logic, not replace it.
2. **Deterministic:** The behaviour tree tick produces the same outcomes for the same inputs, even under load or hotfix conditions, to preserve trust in the tooling.
3. **Contextful:** Module inventory, chassis tier, and stance (Fast vs Discreet) drive which behaviours exist and how they resolve in the world.
4. **Transparent:** Every runtime decision emits data the UI can surface as highlights, logs, or narrative beats.

## Robot Entity Model
- **Chassis Core:** Components for transform, velocity, chassis health, energy, heat budget, and signal strength anchor each robot entity.
- **Module Slots:** Modules install as components that declare capabilities, dependencies, and any passive stats (e.g., max torque, scan arc, cooldown multipliers).
- **Intent Buffers:** Each robot owns transient components that gather behaviour tree outputs (move vectors, manipulation orders, comms payloads) before systems act on them.
- **Blackboard Memory:** A scoped memory component stores `Remember/Recall` key-values, sensor caches, and fail-safe flags without leaking across robots.

## Behaviour Tree Layer
- **Compilation:** On deploy, the block graph normalises into a behaviour tree. Control blocks (If, Repeat, Parallel, Forever) map to composite/decorator nodes; action blocks become leaf nodes bound to module-owned behaviours.
- **Validation:** The compiler performs static checks for missing modules, invalid parameter ranges, or stance conflicts, returning structured warnings to the editor.
- **Annotation:** Each node carries metadata for heat contribution, ethical tags, and debug beacon triggers so telemetry stays tied to programme intent.
- **Hotfix Hooks:** Tree nodes support live replacement when a player hotfixes blocks; updates pulse through the scheduler without resetting robot state unless the edit demands it.

## ECS Execution Loop
1. **Schedule:** The global programme scheduler advances each active behaviour tree on a fixed timestep, respecting chassis tick budgets.
2. **Sense:** Sensor modules refresh their data into components (`ScanResults`, `LineOfSight`, `ThreatMap`) before the tree queries them.
3. **Decide:** Behaviour nodes run, reading sensor components and writing intents (`MovementIntent`, `ManipulatorIntent`, `CommsIntent`) along with requested cooldowns or resource costs.
4. **Resolve:** Dedicated systems consume intents, enforce heat/energy limits, break ties deterministically, and mutate the world (position updates, resource transfers, alert states).
5. **Report:** Resolution emits events (`BehaviourStarted`, `BehaviourCompleted`, `BehaviourThrottled`, `FailsafeTriggered`) for UI overlays, logs, and narrative hooks.

## Telemetry & Player Feedback
- **Execution Highlights:** SimulationShell mirrors the behaviour tree cursor, highlighting active blocks and their world-space effects.
- **Heat & Signal Bars:** Heat/cooldown data from resolution systems feeds inline HUD bars and warning barks from the Mind Fragment.
- **Ethics Prompts:** When annotated behaviours risk Discretion penalties, the runtime surfaces alternative suggestions sourced from the module registry.
- **Debug Beacons:** Within a beacon radius, trees step slower, expose variable bubbles in-world, and log additional traces for later review.

## Implementation Guardrails
- Maintain a single module descriptor source that registers palette blocks, behaviour leaf factories, and telemetry tags to avoid drift.
- Keep intent components short-lived and explicit; systems clear them after each resolve to prevent phantom commands.
- Ensure hotfix edits queue behind the current tick to avoid mid-frame state corruption; the robot acknowledges the new tree on the next schedule slice.
- Log every automatic throttle or failsafe so designers can spot tuning issues without digging into code.

## Near-term Focus
1. Prototype the Motor Mk1 path: block graph → behaviour tree → `MovementIntent` → viewport motion, capturing telemetry events along the way.
2. Document module descriptor schema (capabilities, required components, behaviour factories, telemetry tags) and circulate for review.
3. Spike a minimal debug event bus that both the editor and simulation shell can subscribe to for highlights and logbook entries.

## Open Questions
- How aggressively should resolution systems reconcile conflicting intents (e.g., parallel branches fighting over movement)?
- What constraints keep hotfix frequency from degrading determinism under multiplayer or shared-world considerations?
- Which behaviour metadata belongs in save files to keep programme history and ethics states intact across sessions?
