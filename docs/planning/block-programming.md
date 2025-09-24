# Block Programming Plan

This document outlines how the block-based programming pillar should function within Mind Fragment, aligning the editor, runtime, and progression systems with the narrative beats captured in the steering notes.

## Reset Context
- **Carry-over:** The player-facing goals, block families, and debugging beats were inherited from the previous prototype and should frame any rebuild work.
- **New Work:** Define concrete schema details, UI chrome, and runtime behaviours so we can implement the editor before other systems return.
- **Dependencies:** Cross-reference the steering documents as you elaborate features to ensure the narrative beats still land.

## Goals
- Deliver approachable visual programming that still rewards mastery through optimisation and custom tactics.
- Express the protagonist’s personality via tooling: the editor should feel like borrowing the Mind Fragment’s brilliance, not a sterile IDE.
- Tie block access directly to in-world hardware modules and ethical choices, reinforcing the “means vs ends” tension.

## Design Pillars
1. **Legible Feedback** — Players must see cause, effect, and failure conditions quickly. Heat levels, execution traces, and audio barks reinforce learning loops.
2. **Contextual Palette** — The available blocks adapt to the active chassis, installed modules, and stance (Fast vs Discreet). Players should never wade through irrelevant options.
3. **Field-first Iteration** — Programmes are expected to be written, tested, and tweaked while robots operate. Hotfixing carries heat risks; full compiles are safe but slower.
4. **Shareable Expertise** — Programmes can be saved as “cards” and swapped between robots or players, encouraging community problem-solving.

## Player Flow
1. **Unlock Module → Receive Block Family** — e.g., Motor Mk1 unlocks motion primitives, as listed in the [experience direction notes](../steering/experience.md#modules--blocks-you-unlock-examples).
2. **Author Programme in Editor** — Player arranges blocks, guided by tooltips and contextual hints (e.g., “Avoid disturbing nests to maintain Discretion”).
3. **Deploy & Observe** — Robot executes programme; telemetry bubbles show current block, sensor readings, and heat.
4. **React** — Player either hotfixes on the spot or bookmarks the scenario for a deeper compile later.

## System Architecture

### Editor Layer
- Built on the BlockKit-style canvas with additional chrome for heat, signal strength, and ethical stance indicators.
- Supports palette filtering by module tags, environment context (e.g., weather), and saved templates.
- Offers quick actions: “Insert Failsafe”, “Add Debug Beacon Here”, “Request Programme Card”.

### Runtime Layer
- Each robot ticks its programme on a shared scheduler; frame budget determined by chassis tier.
- Heat accumulation is tracked per block. Excess heat triggers warnings, then auto-throttling or failsafe handover.
- Failsafe routines are authored via a constrained palette unlocked early; they run when signal drops or heat caps out.
- `MoveTo` routines now pull the most recent survey hit from runtime memory, steering towards the chosen index and falling back to literal coordinates when the buffer is empty.

### Content Layer
- Story arcs introduce unique block modifiers (e.g., Nomads grant `MoveTo` → `AvoidBiome(type)`).
- Ethical decisions adjust available modifiers and mission scripting, aligning with the Discretion/Impact axis.

## Parameter Schema Refresh
- **New Work:** The runtime now compiles parameter bindings that differentiate between literal input and authored expressions, preserving the player’s intent in metadata (`source: 'user' | 'default'`). Numeric fields expose optional min/max/step hints so UI editors can nudge players toward safe ranges.
- **New Work:** Each block may declare both `parameters` and `expressionInputs`. Parameters hold the current literal, while expression inputs store an ordered list of child blocks (values, operators, or signals) that can override the literal at runtime.
- **Carry-over:** Signals retain their role as named channels exposed by robot modules, but the editor now surfaces telemetry-driven options alongside palette defaults.

### Value Blocks & Operator Chains
- **New Work:** Literal Number/Boolean blocks advertise their current value directly in the workspace, and edits flag the binding as player-authored. Operator blocks (`Add`, `Greater Than`, `Logical AND`) accept nested expression trees so complex repeat counts or conditions can be composed inline.
- **New Work:** Parameter drop-zones expose copy-friendly guidance (“Drop value blocks here”, “Drop operator blocks here”) and support reordering, letting players combine literals, operators, and signals without leaving the canvas.
- **Carry-over:** Control blocks (Repeat, If, Parallel) still own the surrounding structure, but they now inherit expression defaults (e.g., Repeat spawns a literal-number child set to its default count) to reduce empty states.

### Signal Selection Workflow
- **New Work:** Signal parameters resolve against live telemetry snapshots, merging module-provided options with any fallback entries defined in the palette. Unknown signal IDs trigger diagnostics so the compile step highlights stale references.
- **New Work:** Editor select boxes emit accessible labels and honour “None” for optional channels. Playwright coverage exercises selecting an alternate signal before running the programme to keep regressions visible.

### Tooling & Regression Coverage
- **New Work:** Vitest suites now cover editing literals, dropping operator blocks into parameter expressions, and verifying compiled instructions respect user-specified values. Playwright flows mirror the same interactions end-to-end so we catch integration slips.
- **Carry-over:** Running `npm test`, `npm run typecheck`, and targeted Playwright specs remains mandatory before shipping block-editor work.

## Module → Block Families
| Module | Primary Blocks | Modifiers & Notes |
| --- | --- | --- |
| **Motor Mk1** | `MoveTo`, `TryStep`, `Orbit(target,radius)`, `Follow(entity)` | Pathfinding heuristics unlock through ruins (“Programming-as-Loot”). |
| **Scanner Mk1** | `Scan(filter)`, `LineOfSight`, `TagRead`, `Detect(Hazard|Nest|Enemy)` | Filter presets respond to ethical stance (Fast emphasises efficiency, Discreet emphasises avoidance). |
| **Manipulator Mk1** | `Collect`, `Deposit`, `Build(blueprint)`, `Repair(target)` | Extended reach and finesse modifiers appear after first Uplink objective. |
| **Comms Mk1** | `Broadcast(topic,payload)`, `Subscribe(topic)`, `Request("Haul", payload)` | Enables pipeline automation: Worker A publishes, Mule B subscribes. |
| **Logic Core Mk1** | `If`, `Repeat(n)`, `Wait(t)`, `Remember(key,val)`, `Recall(key)` | Memory blocks consume RAM; higher-tier chassis expand capacity. |
| **Shield/Weapon Mk1** | `ThreatResponse(mode)`, `Stun`, `Guard(radius)` | Defensive modifiers emphasise non-lethal control to maintain Discretion. |

## Debugging & Feedback
- **Debug Beacons**: Temporary zones that slow execution, visualise variable states, and allow step-through for 20 seconds.
- **Heat & Signal Indicators**: Inline widgets show per-block heat contribution and signal strength relative to the Mind Fragment.
- **Ethics Prompts**: When a programme risks harming locals, UI surfaces alternative block suggestions (“Reroute Around Nest”).
- **Logbook**: Automatically records recent block transitions and failure events for later review.

## Progression Hooks
- Completing starter quests (“Spark the Bay”, “Paths of Least Harm”, etc.) awards new block modifiers or RAM upgrades.
- Rival encounters introduce “Bossy Puzzles” where reading enemy programmes teaches counter-blocks.
- Collectable “Insight Shards” occasionally unlock global editor upgrades (additional palette filters, advanced search, voiceover hints).

## Implementation Roadmap
1. **Define Schema** — Enumerate all block types, ports, and payload structures; align with BlockKit registry expectations.
2. **Prototype Editor Skin** — Implement contextual palette, heat meter, and ethical stance banner.
3. **Runtime Simulation** — Build a lightweight scheduler prototype that can run sample programmes and report heat/signal metrics.
4. **Failsafe Toolkit** — Craft constrained block set for out-of-range behaviour and ensure it integrates with the Discretion/Impact system.
5. **Template Library** — Seed the game with a handful of programme cards (“Gentle Harvester”, “Relay Scout”, “Sentry Chill”).
6. **Telemetry & Logs** — Instrument runtime with events feeding both UI overlays and post-run logbook.

## Open Questions
- How granular should heat budgeting be (per block vs per block family)?
- What penalties, if any, should repeated hotfixing apply beyond heat (e.g., temporary instability, snarky dialogue)?
- How do we communicate ethical consequences before the player finalises a programme?

## Immediate Next Steps
- Finalise the block schema draft and review against the BlockKit capabilities.
- Mock up the editor HUD showing heat, signal, and ethical warnings.
- Draft voice lines to accompany key editor actions using the [voice & tone sheet](../steering/voice-and-tone.md).
