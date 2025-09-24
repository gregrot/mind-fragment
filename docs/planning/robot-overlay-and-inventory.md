# Robot Overlay, Chassis, and Inventory Spec

This document defines the rebuilt interaction model for entity overlays, robot chassis management, and inventory handling in the Mind Fragment reboot. It folds in the lessons from the previous prototype while aligning with the block-programming-first roadmap.

## Reset Context
- **Carry-over:** Inspector components remain the composable building blocks for entity overlays so we can mix-and-match contextual UI without bespoke panels per entity type.
- **New Work:** Re-establish the chassis and inventory inspectors with modernised drag-and-drop behaviour, live thumbnails, and stacking rules that support a richer module ecosystem.
- **New Work:** Ensure the programming tab, chassis loadout, and inventory state stay synchronised with immediate persistence so module swaps and programme edits propagate without manual saves.

## Overlay Structure and Lifecycle
- Clicking any entity summons its overlay. For simple entities this resolves to a compact info bubble; complex entities receive the full tabbed overlay.
- The overlay closes automatically when the player clicks outside it or presses <kbd>Esc</kbd>. There is no dedicated close button.
- We only target mouse and touch input for this iteration. Keyboard or controller navigation can be revisited later.
- The overlay retains focus state so repeated clicks on the same entity do not recreate it unnecessarily; inspector content should refresh in place when the underlying entity changes.

## Inspector Framework
- Reuse the existing inspector-component framework so every overlay is an ordered stack of inspectors drawn inside a tab container.
- Robots and similar complex entities expose at least two tabs:
  - **Tab 1 — Systems:** Hosts the `ChassisInspector` followed by the `InventoryInspector`.
  - **Tab 2 — Programming:** Hosts the `ProgramInspector`, reusing the current block-programming UI.
- Inspectors publish their required data bindings (inventory contents, chassis slots, execution state) so the overlay manager can request model updates without tightly coupling to entity classes.

## Chassis Inspector Specification
- Default capacity: 3 generic module slots. Slot count should be configurable per chassis definition for future variants.
- Slot typing: all slots accept any module category unless a future chassis override specifies constraints.
- Slot presentation:
  - Show the module’s live thumbnail and name when occupied.
  - On hover (or focus on touch-and-hold), surface a lightweight tooltip summarising module stats and effects.
- Drag-and-drop rules:
  - Modules can be dragged from the chassis into the inventory or swapped with another chassis slot in a single motion.
  - Dropping a module on an occupied chassis slot swaps the two modules.
  - Dropping a module outside any valid slot snaps it back to its origin; no implicit destruction.

## Inventory Inspector Specification
- Baseline capacity: 10 slots, adjustable per entity profile so different robots or storage units can scale naturally.
- Accepts any object in the game, including modules.
- Stacking behaviour:
  - Items stack by default when they share the same identifier and stacking is enabled on their definition.
  - Objects that opt out of stacking always occupy one slot per item.
  - The UI should show stack counts and support split-stack gestures in a follow-up task (call out the omission if designers flag it).
- Drag-and-drop rules:
  - Reordering within the inventory uses drag-and-drop with snap-to-slot placement.
  - Dragging an item onto an occupied inventory slot swaps the items (or merges stacks when compatible).
  - Dragging a module from inventory into a chassis slot equips it immediately, following the chassis swapping rules above.

## Shared Drag-and-Drop Details
- Use live thumbnails as the drag preview so players see the exact item or module they are moving.
- All drop operations snap cleanly to the target slot grid; no free placement.
- When a drag begins, broadcast the source context (inventory slot, chassis slot) so the receiving inspector can validate the drop and resolve swaps atomically.
- Invalid drops cancel the drag and return the item to its origin without side effects.

## Programming Tab Behaviour
- The `ProgramInspector` reflects the current execution state:
  - When a programme is running, the inspector is read-only and highlights the block currently executing.
  - To edit the programme the player must stop execution. Provide explicit copy that communicates the lock state and offers a stop control if absent elsewhere.
- When execution stops, editing unlocks instantly and changes persist immediately back to the robot’s programme store.
- The inspector should listen for chassis changes so blocks that depend on missing modules signal warnings, keeping parity with the runtime checks in the programming plan.

## Simple Entity Info Bubbles
- Simple entities (e.g., resource nodes, loose objects) reuse the inspector framework but may supply only one lightweight inspector.
- Minimum behaviour: display the entity name and a single-line description such as “This is a stick.”
- Optional enrichments (health, output rate) can be layered on per entity definition without deviating from the shared inspector pipeline.

## Data Model and Persistence Updates
- Inventories and chassis loadouts should share a common slot schema that records:
  - Slot identifier and ordering.
  - Occupying item reference (with stack count where relevant).
  - Metadata flags (stackable, module subtype, lock status).
- Entity models must expose:
  - `inventory` data matching the slot schema above.
  - `chassis` data with slot capacity and the attached module list.
  - `programState` covering current programme, execution status, and active block pointer.
- All modifications triggered through the overlay persist immediately to the authoritative model. There is no apply/confirm step.
- Emit change events whenever a slot, stack count, or programme state updates so other systems (telemetry, block editor, save-state) stay in sync without polling.

## Follow-up Considerations
- Audit existing inventory/chassis persistence code to ensure it speaks the new shared slot schema; retire legacy serializers that assume fixed module positions.
- Document any missing UX niceties (stack splitting, tooltips on touch) as separate tasks once this baseline spec is approved.
- Coordinate with art direction to source consistent thumbnails so the live previews remain readable across the overlay themes.
