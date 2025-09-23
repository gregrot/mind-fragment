# Release Notes — Parameterised Block Editor

## Summary
- **New Work:** Block parameter bindings now capture whether values originate from defaults or player edits, letting the runtime honour custom literals and expression trees.
- **New Work:** Palette additions for literal values, signal readers, and arithmetic/logical operators let programmes express richer control flow without bespoke code.
- **Carry-over:** Workspace persistence per robot and slot-based composition remain unchanged, so previously captured layouts continue to load.

## Editor Highlights
- Literal value blocks show their current number/boolean inline; editing them updates the underlying block instance and marks the binding as `source: 'user'`.
- Operator blocks (Add, Greater Than, Logical AND) accept nested inputs so players can combine literals, signals, and other operators for repeat counts or branch conditions.
- Signal selectors merge live telemetry options with palette defaults, surfacing diagnostics if a saved programme references an unknown channel.

## Runtime Adjustments
- Compilation now passes through user-authored literals and expression metadata, ensuring counted loops, conditional checks, and status toggles respect in-editor overrides.
- Boolean and numeric bindings clamp to declared min/max constraints, emitting warnings when user edits fall outside supported ranges.
- Unsupported action blocks still raise diagnostics, but they no longer mask successful compilation of adjacent operator-driven loops.

## Testing & Tooling
- Vitest suites cover numeric editing, signal selection, operator drops, and runtime compilation of user values.
- Playwright regression (`npx playwright test playwright/block-workspace.spec.ts`) drives the same interactions end-to-end.
- Standard checks remain: `npm test`, `npm run typecheck`, and any targeted Playwright specs touched by a change.

## Next Steps
- Extend operator coverage with subtraction/division blocks once the maths primitives land.
- Surface compiled instruction previews in the UI so players can inspect resolved values before deploying.
- Wire broadcast-signal compilation to the runtime pipeline as soon as the signalling subsystem is ready.
