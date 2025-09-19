# Programmable Robot MVP Task List

This task list sets out the minimum work required to stand up a controllable, modular robot in the Mind Fragment sandbox that players can programme through the planned block interface. It assumes we are rebuilding on web technology with PixiJS for lightweight rendering.

## Reset Context
- **Carry-over:** Reuse the block-programming pillars already captured in the existing planning notes so the new runtime and UI remain aligned with the narrative tone.
- **New Work:** Establish a minimal but complete loop covering robot rendering, input scheduling, execution feedback, and automated verification so designers can iterate safely.
- **New Work:** Introduce a stackable module system so the robot’s capabilities derive from the attached modules and can expand over time without rewriting the core chassis.

## Milestone Overview
1. **Simulation Shell (Complete):** Prepare the project structure, dependencies, and PixiJS scene graph needed to host the robot and sandbox environment.
2. **Robot Core Systems:** Model the robot chassis, module stack, sensors, and actuators with a data contract that the block runtime can consume.
3. **Module Library & Inventory:** Deliver the initial set of stackable modules that expose programmable parameters and blocks.
4. **Programmable Interface:** Deliver a pared-down block palette and execution pipeline that lets users compose and deploy behaviours.
5. **Feedback & Telemetry:** Surface visual and textual cues so users understand what their programme is doing inside the simulation.
6. **Testing & Tooling:** Lock in automated tests and developer workflows that keep the MVP stable as features expand.

## Detailed Tasks

### 1. Simulation Shell
**Status:** Complete

- **Workspace scaffold:** Extended the existing Vite/React workspace with PixiJS (v7) and `pixi-viewport` so the simulation can run alongside the block builder without bespoke build scripts.
- **Scene setup:** Implemented a `RootScene` wrapper that adds camera controls, locks updates to a fixed 16.67 ms simulation step, and renders a procedural grid with axis overlays plus a placeholder chassis sprite for spatial reference.
- **Asset service:** Introduced a lightweight asset service that caches textures, generates vector placeholders at runtime, and wraps PixiJS's loader so designers can swap art without touching the simulation loop.
- **Follow-up notes:** Defer dedicated lighting, parallax layering, and telemetry instrumentation to later milestones once module and feedback systems inform the visual language.

### 2. Robot Core Systems
- Define a robot entity model covering position, orientation, velocity, and energy/heat values in line with the Block Programming Plan.
- Establish a module stack container that enforces attachment order, capacity limits, and module dependencies while staying extensible for future tiers.
- Implement a messaging contract between the chassis and modules so each module can publish values (parameters, sensor feeds) and callable functions (block actions).
- Provide a simulation tick that aggregates module outputs and resolves conflicting actuator requests deterministically.

### 3. Module Library & Inventory
**Status:** Complete

- Document the MVP module catalogue and their required attachment slots so designers can reason about progression.
- Build module definitions for the starter set: **Movement**, **Manipulation**, **Crafting**, and **Scanning**. Each definition must include exposed parameters, block hooks, and telemetry channels.
- Implement module initialisation routines that register their values and functions with the runtime when added to the stack and deregister them cleanly when removed.
- Add placeholder art or iconography per module to clarify configuration inside the scene and debug tooling.

| Module | Slot & Index | Provides | Parameters | Block Hooks | Telemetry |
| --- | --- | --- | --- | --- | --- |
| **Locomotion Thrusters Mk1** | `core · 0` | `movement.linear`, `movement.angular` | `maxLinearSpeed`, `maxAngularSpeed` | `setLinearVelocity`, `setAngularVelocity` | `distanceTravelled`, `lastCommand` |
| **Precision Manipulator Rig** | `extension · 0` | `manipulation.grip` | `gripStrength` | `configureGrip`, `grip`, `release` | `gripEngaged`, `heldItem`, `operationsCompleted` |
| **Field Fabricator** | `extension · 1` | `crafting.basic` | `defaultDuration` | `queueRecipe`, `cancelRecipe` | `queueLength`, `activeRecipe`, `lastCompleted` |
| **Survey Scanner Suite** | `sensor · 0` | `scanning.survey` | `scanRange`, `cooldownSeconds` | `scan` | `cooldownRemaining`, `lastScan` |

- Placeholder iconography representing locomotion, manipulation, fabrication, and scanning accompanies each module within the simulation debug panel to communicate the current loadout at a glance.

### 4. Programmable Interface
- Integrate the existing block editor shell, narrowing the palette to module-derived blocks (Move, Manipulate, Craft, Scan) plus essential control primitives (Wait, Repeat, Conditional).
- Map block outputs to robot command objects through a clean interpreter or compiler layer that respects module ownership of commands.
- Provide start/stop controls and a deploy pipeline that validates programmes before execution, surfacing parse or runtime errors to the user, including missing-module warnings when blocks reference unavailable capabilities.

### 5. Feedback & Telemetry
- Overlay execution indicators in the PixiJS scene (current block highlight, path traces, sensor pings) using discreet, readable styling.
- Add a collapsible debug panel that streams recent block transitions, module stack changes, sensor values, and actuator responses.
- Instrument heat or energy consumption bars and warning states consistent with the broader experience direction, and include module-level cooldown or durability readouts where relevant.

### 6. Testing & Tooling
- Write unit tests for the robot state model, module registration lifecycle, interpreter mapping, and actuator behaviours using the existing test runner (or introduce Vitest if required).
- Add integration tests that simulate full programme runs headlessly across different module stacks, asserting expected position changes, resource interactions, and telemetry output.
- Configure CI scripts (package.json commands) to run linting and the full test suite; document the workflow in the README once stabilised.

## Dependencies & Notes
- Coordinate art direction and UX decisions with the steering documents to keep tone and affordances aligned.
- Document any temporary shortcuts (e.g., placeholder art, reduced physics) directly in this file so follow-up tasks can retire them.
- As we expand beyond the MVP, revisit this list and fold outstanding items into the broader Block Programming roadmap rather than creating parallel plans.
