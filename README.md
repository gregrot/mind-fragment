# Mind Fragment

A block-programming sandbox about rebuilding field robots after a catastrophic crash. The project pairs a live Pixi.js simulation with a React workspace so designers can assemble logic visually, deploy it instantly, and watch robots react in context.

## Quick start
1. Install dependencies with `npm install`.
2. Run `npm run dev` to launch Vite at `http://localhost:5173/`.
3. Execute `npm test` for unit coverage and `npm run typecheck` to validate TypeScript types. Playwright specs live under `playwright/` and can be executed with `npx playwright test` once browsers are installed (`npx playwright install --with-deps`).

## Project structure
- `src/main.tsx` bootstraps React and wires global providers (drag context, overlay manager, simulation runtime binding).
- `src/App.tsx` orchestrates the simulation shell, block workspace, and robot overlay.
- `src/components/` contains UI building blocks such as the block palette, workspace renderer, programming panel, and runtime controls.
- `src/simulation/` hosts the Pixi scene graph, ECS runtime, and robot abstractions.
- `src/state/` contains shared stores for overlay persistence, simulation status, and selection.
- `docs/` holds design intent. Update the summaries below whenever documents change.

## Documentation map
- [Application Steering Guide](docs/steering/application-steering.md) — how the experience should feel and the principles that bind the simulation, workspace, and overlays together.
- [Mind Fragment Roadmap](docs/planning/roadmap.md) — phased plan for delivering features, debugging tools, and persistence.

## Working practices
- Treat the block workspace as the primary interaction surface. New systems should integrate with it or the entity overlay so players never lose sight of their robots.
- Keep tone and copy grounded in pragmatic survival with flashes of dry wit.
- When plans or priorities shift, update the relevant Markdown in place; avoid scattering notes across duplicate files.
