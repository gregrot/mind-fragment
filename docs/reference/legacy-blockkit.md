# Legacy BlockKit Notes

This reference captures the useful pieces of the BlockKit TypeScript starter that powered the previous prototype. Treat it as a checklist when deciding what to recreate, what to refactor, and where the rebuilt systems need bespoke solutions.

## Carry-over Capabilities
- **Block registry API** for defining the data model of custom blocks and exposing them to the editor.
- **Graph model** (nodes, ports, and links) with serialisation support for saving/loading programmes.
- **Canvas editor** that supports drag-and-drop from a palette and click-to-connect wiring.
- **Interpreter** that executes a block graph in topological order, with a pluggable interface if we need bespoke runtime hooks.
- **Type safety** through schema validation, keeping authored graphs in sync with the runtime contract.

## Rebuild Implications
- The registry pattern maps neatly to our module unlocks: each hardware module can register a block family.
- Serialised graphs can be versioned alongside the campaign state, allowing hotfixes or migrations between milestones.
- The interpreter already tracks execution order, which we can extend with **debug beacons** and **heat budgets** described in the [experience notes](../steering/experience.md).
- Palette filtering (by tag, by chassis slots, by ethical stance) should sit on top of the registry without heavy rework.

## New Work & Questions
- How do we surface ethical stance feedback and heat warnings without rewriting the canvas from scratch?
- What additional data needs to ride along with serialised programmes to support failsafes and hotfix history?
- Do we fork the interpreter or wrap it so we can inject real-time telemetry events?

## Integration To-Dos
1. Define a Mind Fragment block schema that mirrors the module list in the [experience direction](../steering/experience.md).
2. Prototype the runtime contract for field execution: programme tick rate, heat accrual, and failsafe fallbacks.
3. Explore authoring UX customisations: inline telemetry bubbles, contextual tooltips, and ethical choice surfacing.
4. Plan import/export to share programme “cards” between saves and potentially with other players.

## Next Steps
- Use these capabilities as guardrails when writing the block programming plan.
- Identify which parts we can reuse directly and which warrant a fresh implementation tailored to the narrative tone and mechanical constraints.
