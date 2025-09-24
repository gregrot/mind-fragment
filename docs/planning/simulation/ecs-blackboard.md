# ECS Blackboard Planning Notes

## Reset Context
- **Carry-over:** The previous PixiJS shell leaned on `RootScene` to hoard shared state such as programme status, selection, and telemetry snapshots. That state fed both UI chrome and future ECS systems, but the coupling made it difficult to migrate behaviours without duplicating logic.
- **New Work:** Reintroduce a lightweight `ECSBlackboard` so behaviour-tree inspired systems can publish facts and events that any system – UI or simulation – can query without touching `RootScene` internals.

## Pattern Survey
### Behaviour-tree blackboards (Halo Wars, Unreal)
- Store persistent facts (`targetPosition`, `lastScan`) alongside transient decorators (`hasLineOfSight`).
- Nodes write once per tick; sensor systems clear or refresh when the fact becomes stale.
- Events (e.g., "target lost") are published to separate channels so consumers can react once before the queue resets.

### GOAP-style working memory (F.E.A.R., RimWorld mods)
- Actions publish goals and world-state deltas to a shared map; planners pull the latest values when re-evaluating plans.
- Facts are namespaced (`resource.scan.visible`, `movement.intent`) to keep collisions predictable.
- Event buffers sit next to the fact map so planners can consume, not poll, moments such as "resource depleted".

### ECS resource registries (Unity DOTS, Bevy blackboard experiments)
- The blackboard is treated as an ECS resource: systems inject the resource, mutate facts, and emit ephemeral events.
- Consumers store the keys they depend on and guard against missing data, keeping systems loosely coupled.
- Debug overlays subscribe to both fact snapshots and event feeds to render traces without bespoke wiring.

## Mind Fragment Blackboard Model
- **Facts** capture durable state (`program.status`, `selection.activeRobotId`, `telemetry.latest`). They are overwritten when new information arrives and can be read by any system at any time.
- **Events** capture moments (`program.status.changed`, `selection.changed`, `telemetry.updated`, `ui.signal`). They behave like queues; consumers drain the payloads they understand and ignore the rest.
- **Namespacing** follows `domain.topic.detail`, keeping the keys self-describing.
- **Helpers** on `ECSBlackboard` provide `setFact`, `updateFact`, `publishEvent`, `peekEvents`, and `consumeEvents` so systems can write concise intent without re-implementing bookkeeping.

### Proposed Fact Registry
| Key | Description | Publisher(s) | Consumer(s) |
| --- | --- | --- | --- |
| `program.status` | Current `BlockProgramRunner` status (`idle`, `running`, `completed`). | Programme runner system, runtime orchestration. | UI status badges, debug overlay, auto-start guardrails. |
| `selection.activeRobotId` | Robot entity currently owned by the player (nullable). | Selection system, runtime orchestration. | HUD selection widgets, contextual tooltips, block editor focus. |
| `telemetry.latest` | Snapshot of the selected robot's telemetry (values + action states). | Telemetry capture system, module layer. | Status indicator system, debug overlays, logbook writers. |
| `ui.signal.current` | Most recent UI signal payload surfaced by simulation-side systems. | Presentation systems. | React UI bridge, voice prompts. |

### Proposed Event Channels
| Key | Payload | Description |
| --- | --- | --- |
| `program.status.changed` | `ProgramRunnerStatus` | Fired whenever the runner transitions state; consumers clear stale UI. |
| `selection.changed` | `string \| null` | Fired when a different robot becomes active; triggers retargeting of telemetry and overlays. |
| `telemetry.updated` | Telemetry snapshot | Fired when module telemetry refreshes; UI may throttle consumption for performance. |
| `ui.signal` | `{ type: string; payload?: Record<string, unknown> }` | Lightweight signal bus for overlays, speech bubbles, or haptic hints. |

## System Interactions
- **Programme runner system** writes `program.status` and emits `program.status.changed`. It also reads `selection.activeRobotId` if per-robot scheduling becomes necessary.
- **Status indicator system** reads `telemetry.latest` to determine module health, publishing `ui.signal` hints when the status toggles.
- **Resource layer system** publishes `telemetry.updated` when resource field telemetry changes and stores derived overlays under `ui.signal` for the React HUD.
- **Selection system** owns `selection.activeRobotId` and emits `selection.changed` so the runtime knows when to refresh telemetry and programme bindings.
- **UI bridge (React)** consumes facts via selectors and drains event queues each frame, acknowledging once handled to keep the blackboard lean.

## Migration Tasks
1. **Backfill ECS systems:** Update the programme runner, status indicator, resource layer overlay, and selection systems to read/write via `ECSBlackboard` rather than `RootScene`. Each system should guard against missing keys and emit events when it mutates facts.
2. **RootScene slim-down:** Strip direct state storage (`programStatus`, `pendingSelection`, ad-hoc telemetry caches) once the systems above publish to the blackboard, retaining only viewport and Pixi container responsibilities.
3. **Telemetry sync pass:** Introduce a telemetry sync system that refreshes `telemetry.latest` when the selected robot or module stack changes, emitting `telemetry.updated` so UI and debug overlays stay accurate.
4. **UI integration:** Add a bridge layer that consumes blackboard events on each tick, dispatching them into the React state store while leaving the facts intact for other systems.
