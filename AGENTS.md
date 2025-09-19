# AGENTS

## Scope
These guidelines apply to the entire repository.

## Reset Principles
- This repo is a clean slate for rebuilding Mind Fragment while retaining lessons from the previous prototype.
- Preserve useful information by folding, reframing, or annotating it inside the Markdown documents rather than archiving it elsewhere.
- Maintain a block-programming-first perspective when prioritising new planning work or reorganising existing material.

## Documentation Layout
- Keep `README.md` at the repository root as the entry point and map of the design set.
- Organise long-form material under `docs/` using the current categories:
  - `docs/steering/` for vision, tone, and player experience direction.
  - `docs/planning/` for implementation roadmaps and near-term tasks.
  - `docs/reference/` for notes about legacy systems or external inspirations.
- When adding or renaming documents, update the README table of contents with a short description so navigation stays accurate.
- Prefer renaming and editing existing documents over duplicating content when the intent evolves.

## Writing Style
- Structure documents with clear headings, ordered or unordered lists, and call-outs for “Carry-over” vs “New Work” when relevant.
- Use British English spelling unless quoting legacy text verbatim.
- Keep the tone direct and practical, but retain the voice that defines the Mind Fragment narrative when presenting flavour material.

## Maintenance
- Only Markdown files should live in the repository unless a task explicitly requires another format.
- No automated tests are required for documentation-only updates.
