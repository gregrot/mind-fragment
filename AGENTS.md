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
- Every non-documentation task must include appropriate automated coverage. Add or extend unit tests and Playwright scenarios alongside the feature work, and run `npm test`, `npm run typecheck`, and `npx playwright test` before concluding the task.
- The codebase now uses TypeScript. Run `npm run typecheck` alongside existing checks when modifying source files, and prefer `npx tsx` for executing Node-based tooling.
- Playwright UI checks run in CI. When setting up the environment locally, run `npx playwright install --with-deps` after installing npm packages so the browsers and system dependencies are present.

## Planning Prompts
- When planning a task or spotting assumptions, draft targeted clarification questions and point the user to the `npm run ask` helper.
- Share the `npm run ask -- --questions '<json>'` command (or `--file` alternative) so the user can quickly gather their answers with the questionnaire tool.
- Incorporate the returned responses directly into the plan before committing to an implementation direction.
