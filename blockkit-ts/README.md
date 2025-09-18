# BlockKit TS – React + TypeScript visual blocks starter

This is a minimal but production‑ready **starter package** for building a drag‑and‑drop, block‑based programming editor that host apps can embed. It gives you:

- A clean **Block Registry API** to define a DSL and blocks.
- A simple **graph model** (nodes + ports + links) with serialization.
- A **canvas editor** with drag‑drop from a palette and click‑to‑connect wiring.
- A pluggable **interpreter** (default provided) that runs graphs by topological order.
- Strong types and **schema validation**.

It's intentionally compact so you can extend it with your own styling, persistence, and execution backends.

## Getting Started

1. Install dependencies: `npm install`
2. Run the example: `npm run dev`
3. Build the library: `npm run build`

## Usage

```tsx
import { BlockEditor, BlockRegistry, DefaultBlocks } from "blockkit-ts";

const registry = new BlockRegistry();
DefaultBlocks.forEach(b => registry.register(b));

function App() {
  return <BlockEditor registry={registry} height={560} />;
}
```

See `example/App.tsx` for a complete working example.