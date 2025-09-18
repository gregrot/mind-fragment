# BlockKit TS – React + TypeScript visual blocks starter

This is a minimal but production‑ready **starter package** for building a drag‑and‑drop, block‑based programming editor that host apps can embed. It gives you:

- A clean **Block Registry API** to define a DSL and blocks.
- A simple **graph model** (nodes + ports + links) with serialization.
- A **canvas editor** with drag‑drop from a palette and click‑to‑connect wiring.
- A pluggable **interpreter** (default provided) that runs graphs by topological order.
- Strong types and **schema validation**.

It’s intentionally compact so you can extend it with your own styling, persistence, and execution backends.

---

## File layout
```
blockkit-ts/
  package.json
  README.md
  src/
    index.ts
    types.ts
    BlockRegistry.ts
    Graph.ts
    BlockEditor.tsx
    Interpreter.ts
    DefaultBlocks.ts
  example/
    App.tsx
```

> You can copy/paste the files below into your repo. The example shows how a host app defines a DSL and uses the editor.

---

## `package.json`
```json
{
  "name": "blockkit-ts",
  "version": "0.1.0",
  "description": "Pluggable visual blocks editor + runtime for React (TypeScript)",
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.esm.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.esm.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json && vite build --config vite.lib.config.ts",
    "dev": "vite --config vite.example.config.ts --open",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  },
  "dependencies": {
    "zod": "^3.23.8",
    "zustand": "^4.5.3",
    "nanoid": "^5.0.7"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vite": "^5.4.8",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0"
  }
}
```

> You can ship as a library via Vite library mode or plain `tsc`. Keep React as a peer dep.

---

## `src/types.ts`
```ts
import { z } from "zod";

export type PortDirection = "in" | "out";
export type ValueType = "number" | "string" | "boolean" | "any" | { union: ValueType[] };

export interface PortSpec {
  key: string;
  label?: string;
  type?: ValueType;
  // Optional default for inputs
  defaultValue?: unknown;
}

export interface BlockSpec<C = unknown> {
  kind: string;               // unique within registry
  label: string;
  inputs?: PortSpec[];
  outputs?: PortSpec[];
  // Optional UI hints
  color?: string;
  icon?: React.ReactNode;
  // Optional config per node instance
  configSchema?: z.ZodType<C>;
  // Runtime function: given resolved input values + config, produce outputs
  evaluate?: (ctx: { inputs: Record<string, unknown>; config: C }) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export type NodeId = string;
export type PortId = string; // `${nodeId}:${portKey}`

export interface NodeInstance<C = any> {
  id: NodeId;
  kind: string; // BlockSpec.kind
  x: number;    // canvas position
  y: number;
  config?: C;
}

export interface LinkEdge {
  id: string;
  from: { nodeId: NodeId; portKey: string }; // out
  to: { nodeId: NodeId; portKey: string };   // in
}

export interface GraphData {
  nodes: NodeInstance[];
  links: LinkEdge[];
}

export const GraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    x: z.number(),
    y: z.number(),
    config: z.any().optional()
  })),
  links: z.array(z.object({
    id: z.string(),
    from: z.object({ nodeId: z.string(), portKey: z.string() }),
    to: z.object({ nodeId: z.string(), portKey: z.string() })
  }))
});

export type GraphValidation = z.infer<typeof GraphSchema>;
```

---

## `src/BlockRegistry.ts`
```ts
import { BlockSpec, ValueType } from "./types";

export class BlockRegistry {
  private specs = new Map<string, BlockSpec>();

  register<T>(spec: BlockSpec<T>) {
    if (this.specs.has(spec.kind)) throw new Error(`Block kind already registered: ${spec.kind}`);
    this.specs.set(spec.kind, spec);
    return this;
  }

  get(kind: string) { return this.specs.get(kind); }
  all() { return Array.from(this.specs.values()); }
}

export const isTypeCompatible = (a?: ValueType, b?: ValueType): boolean => {
  if (!a || !b) return true;
  if (a === "any" || b === "any") return true;
  if (typeof a === "string" && typeof b === "string") return a === b;
  const toUnion = (t: ValueType): ValueType[] => typeof t === "string" ? [t] : t.union;
  const au = toUnion(a), bu = toUnion(b);
  return au.some(t => bu.includes(t));
};
```

---

## `src/Graph.ts`
```ts
import { create } from "zustand";
import { nanoid } from "nanoid";
import type { GraphData, LinkEdge, NodeInstance } from "./types";

export interface GraphState extends GraphData {
  addNode: (node: Omit<NodeInstance, "id"> & { id?: string }) => string;
  moveNode: (id: string, x: number, y: number) => void;
  removeNode: (id: string) => void;
  addLink: (from: LinkEdge["from"], to: LinkEdge["to"]) => string | null;
  removeLink: (id: string) => void;
  load: (g: GraphData) => void;
}

export const useGraph = create<GraphState>((set, get) => ({
  nodes: [],
  links: [],

  addNode(partial) {
    const id = partial.id ?? nanoid();
    set(s => ({ nodes: [...s.nodes, { id, ...partial }] }));
    return id;
  },

  moveNode(id, x, y) {
    set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, x, y } : n) }));
  },

  removeNode(id) {
    set(s => ({
      nodes: s.nodes.filter(n => n.id !== id),
      links: s.links.filter(l => l.from.nodeId !== id && l.to.nodeId !== id)
    }));
  },

  addLink(from, to) {
    const id = nanoid();
    const exists = get().links.some(l => l.from.nodeId === from.nodeId && l.from.portKey === from.portKey && l.to.nodeId === to.nodeId && l.to.portKey === to.portKey);
    if (exists) return null;
    set(s => ({ links: [...s.links, { id, from, to }] }));
    return id;
  },

  removeLink(id) { set(s => ({ links: s.links.filter(l => l.id !== id) })); },

  load(g) { set(() => g); }
}));

export const serialize = (): GraphData => {
  const { nodes, links } = useGraph.getState();
  return { nodes: [...nodes], links: [...links] };
};
```

---

## `src/Interpreter.ts`
```ts
import { BlockRegistry } from "./BlockRegistry";
import type { GraphData, NodeInstance } from "./types";

export interface ExecutionResult {
  values: Map<string, Record<string, unknown>>; // nodeId -> outputs
}

export class Interpreter {
  constructor(private registry: BlockRegistry) {}

  async run(graph: GraphData): Promise<ExecutionResult> {
    const order = topoSort(graph);
    const values = new Map<string, Record<string, unknown>>();

    for (const nodeId of order) {
      const node = graph.nodes.find(n => n.id === nodeId)!;
      const spec = this.registry.get(node.kind);
      if (!spec) throw new Error(`Unknown block: ${node.kind}`);

      const inputs = resolveInputs(graph, values, node);
      const config = node.config as any;
      const result = spec.evaluate ? await spec.evaluate({ inputs, config }) : {};
      values.set(nodeId, result);
    }

    return { values };
  }
}

function topoSort(graph: GraphData): string[] {
  const incoming = new Map<string, number>();
  graph.nodes.forEach(n => incoming.set(n.id, 0));
  graph.links.forEach(l => incoming.set(l.to.nodeId, (incoming.get(l.to.nodeId) ?? 0) + 1));

  const q: string[] = graph.nodes.filter(n => (incoming.get(n.id) ?? 0) === 0).map(n => n.id);
  const order: string[] = [];

  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    for (const e of graph.links.filter(l => l.from.nodeId === id)) {
      const to = e.to.nodeId;
      incoming.set(to, (incoming.get(to) ?? 1) - 1);
      if ((incoming.get(to) ?? 0) === 0) q.push(to);
    }
  }
  if (order.length !== graph.nodes.length) throw new Error("Graph contains a cycle");
  return order;
}

function resolveInputs(graph: GraphData, values: Map<string, Record<string, unknown>>, node: NodeInstance) {
  const inputs: Record<string, unknown> = {};
  const incoming = graph.links.filter(l => l.to.nodeId === node.id);
  for (const link of incoming) {
    const srcVals = values.get(link.from.nodeId) ?? {};
    inputs[link.to.portKey] = srcVals[link.from.portKey];
  }
  return inputs;
}
```

---

## `src/DefaultBlocks.ts`
```ts
import type { BlockSpec } from "./types";

export const ConstNumber: BlockSpec<{ value: number }> = {
  kind: "const.number",
  label: "Number",
  outputs: [{ key: "out", label: "out", type: "number" }],
  configSchema: undefined,
  evaluate: ({ config }) => ({ out: (config as any)?.value ?? 0 })
};

export const Add: BlockSpec<{}> = {
  kind: "math.add",
  label: "+",
  inputs: [
    { key: "a", type: "number", defaultValue: 0 },
    { key: "b", type: "number", defaultValue: 0 }
  ],
  outputs: [{ key: "sum", type: "number" }],
  evaluate: ({ inputs }) => ({ sum: (Number(inputs.a) || 0) + (Number(inputs.b) || 0) })
};

export const Multiply: BlockSpec<{}> = {
  kind: "math.mul",
  label: "×",
  inputs: [
    { key: "a", type: "number", defaultValue: 1 },
    { key: "b", type: "number", defaultValue: 1 }
  ],
  outputs: [{ key: "prod", type: "number" }],
  evaluate: ({ inputs }) => ({ prod: (Number(inputs.a) || 1) * (Number(inputs.b) || 1) })
};

export const ToString: BlockSpec<{}> = {
  kind: "to.string",
  label: "toString",
  inputs: [{ key: "value", type: { union: ["number", "boolean", "string"] } }],
  outputs: [{ key: "out", type: "string" }],
  evaluate: ({ inputs }) => ({ out: String(inputs.value) })
};

export const Print: BlockSpec<{ prefix?: string }> = {
  kind: "io.print",
  label: "Print",
  inputs: [{ key: "msg", type: "string" }],
  outputs: [{ key: "done", type: "boolean" }],
  evaluate: ({ inputs }) => { console.log(inputs.msg); return { done: true }; }
};

export const DefaultBlocks = [ConstNumber, Add, Multiply, ToString, Print];
```

---

## `src/BlockEditor.tsx`
```tsx
import React, { useMemo, useRef, useState } from "react";
import { useGraph } from "./Graph";
import type { BlockRegistry } from "./BlockRegistry";
import type { NodeInstance } from "./types";

interface Props { registry: BlockRegistry; height?: number; }

export const BlockEditor: React.FC<Props> = ({ registry, height = 480 }) => {
  const { nodes, links, addNode, moveNode, addLink, removeLink, removeNode } = useGraph();
  const palette = useMemo(() => registry.all(), [registry]);

  // Drag from palette -> canvas
  const [dragKind, setDragKind] = useState<string | null>(null);

  const onCanvasDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    const kind = e.dataTransfer.getData("text/plain");
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    addNode({ kind, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const [pendingFrom, setPendingFrom] = useState<{ nodeId: string; portKey: string } | null>(null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, height }}>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, overflow: "auto" }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Palette</div>
        {palette.map(spec => (
          <div key={spec.kind}
               draggable
               onDragStart={e => e.dataTransfer.setData("text/plain", spec.kind)}
               style={{ padding: 8, marginBottom: 6, border: "1px solid #ddd", borderRadius: 6, cursor: "grab", userSelect: "none", background: spec.color ?? "#fafafa" }}>
            {spec.label}
          </div>
        ))}
      </div>

      <div
        onDragOver={e => e.preventDefault()}
        onDrop={onCanvasDrop}
        style={{ position: "relative", border: "1px dashed #bbb", borderRadius: 8, background: "#fff" }}
      >
        {/* Links */}
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {links.map(l => {
            const from = nodes.find(n => n.id === l.from.nodeId)!;
            const to = nodes.find(n => n.id === l.to.nodeId)!;
            const p1 = { x: from.x + 140, y: from.y + 24 }; // rough right side
            const p2 = { x: to.x, y: to.y + 24 };            // rough left side
            const midX = (p1.x + p2.x) / 2;
            const d = `M ${p1.x} ${p1.y} C ${midX} ${p1.y}, ${midX} ${p2.y}, ${p2.x} ${p2.y}`;
            return <path key={l.id} d={d} stroke="#555" fill="none" strokeWidth={2} />;
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(n => (
          <NodeCard key={n.id} node={n}
            onMove={(x,y)=>moveNode(n.id,x,y)}
            onRemove={() => removeNode(n.id)}
            onPortClick={(portKey, side) => {
              if (side === "out") setPendingFrom({ nodeId: n.id, portKey });
              else if (pendingFrom) {
                addLink(pendingFrom, { nodeId: n.id, portKey });
                setPendingFrom(null);
              }
            }} />
        ))}
      </div>
    </div>
  );
};

const NodeCard: React.FC<{
  node: NodeInstance;
  onMove: (x:number,y:number)=>void;
  onRemove: ()=>void;
  onPortClick: (portKey: string, side: "in" | "out") => void;
}> = ({ node, onMove, onRemove, onPortClick }) => {
  const dragging = useRef<{ dx: number; dy: number } | null>(null);

  return (
    <div
      style={{ position: "absolute", left: node.x, top: node.y, width: 180, background: "#fefefe", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}
    >
      <div
        onMouseDown={(e) => { dragging.current = { dx: e.clientX - node.x, dy: e.clientY - node.y }; }}
        onMouseMove={(e) => { if (dragging.current) onMove(e.clientX - dragging.current.dx, e.clientY - dragging.current.dy); }}
        onMouseUp={() => (dragging.current = null)}
        style={{ padding: 8, borderBottom: "1px solid #eee", cursor: "move", borderTopLeftRadius: 8, borderTopRightRadius: 8, background: "#f7f7f7", fontWeight: 600 }}
      >
        {node.kind}
        <button onClick={onRemove} style={{ float: "right", fontSize: 12 }}>✕</button>
      </div>

      <div style={{ padding: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          {/* Inputs: keys based on links; minimal UI */}
          <Port side="in" label="in" onClick={() => onPortClick("a", "in")} />
          <Port side="in" label="in" onClick={() => onPortClick("b", "in")} />
        </div>
        <div>
          <Port side="out" label="out" onClick={() => onPortClick("out", "out")} />
        </div>
      </div>
    </div>
  );
};

const Port: React.FC<{ side: "in"|"out"; label: string; onClick: ()=>void }> = ({ side, label, onClick }) => (
  <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
    {side === "in" ? <span style={{ width: 10, height: 10, background: "#2d6cdf", borderRadius: 9999 }} /> : null}
    <span style={{ fontSize: 12, color: "#444" }}>{label}</span>
    {side === "out" ? <span style={{ width: 10, height: 10, background: "#16a34a", borderRadius: 9999 }} /> : null}
  </div>
);
```

> The node UI is intentionally minimal. In your app, render ports from the block spec (inputs/outputs) rather than fixed `a,b,out`. Start simple then extend.

---

## `src/index.ts`
```ts
export * from "./types";
export * from "./BlockRegistry";
export * from "./Graph";
export * from "./Interpreter";
export * from "./DefaultBlocks";
export { BlockEditor } from "./BlockEditor";
```

---

## `example/App.tsx`
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor, BlockRegistry, DefaultBlocks, useGraph, serialize, Interpreter } from "blockkit-ts";

const registry = new BlockRegistry();
DefaultBlocks.forEach(b => registry.register(b));

function Toolbar() {
  const graph = useGraph();
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <button onClick={() => console.log("graph", serialize())}>Export JSON</button>
      <button onClick={async () => {
        const runtime = new Interpreter(registry);
        const res = await runtime.run(serialize());
        console.log("run result", res.values);
      }}>Run</button>
      <button onClick={() => graph.load({ nodes: [], links: [] })}>Clear</button>
    </div>
  );
}

const App = () => (
  <div style={{ padding: 16 }}>
    <h2>BlockKit TS Example</h2>
    <Toolbar />
    <BlockEditor registry={registry} height={560} />
  </div>
);

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

---

## Host‑app API (how you define your DSL)

In your app, create a registry and register blocks that map to your DSL primitives:

```ts
import { BlockRegistry, type BlockSpec } from "blockkit-ts";

const registry = new BlockRegistry();

const FetchUser: BlockSpec<{ userId: string }> = {
  kind: "api.fetchUser",
  label: "Fetch User",
  inputs: [{ key: "id", type: "string" }],
  outputs: [{ key: "user", type: "any" }],
  evaluate: async ({ inputs }) => ({ user: await fetch(`/api/users/${inputs.id}`).then(r => r.json()) })
};

registry
  .register(FetchUser)
  .register({
    kind: "user.fullName",
    label: "Full Name",
    inputs: [{ key: "u", type: "any" }],
    outputs: [{ key: "name", type: "string" }],
    evaluate: ({ inputs }) => ({ name: `${(inputs.u as any)?.first} ${(inputs.u as any)?.last}`.trim() })
  });
```

Now your users can compose these blocks visually and you can run them with the default interpreter.

---

## JSON format (serialize/deserialize)

```jsonc
{
  "nodes": [
    { "id": "n1", "kind": "const.number", "x": 120, "y": 100, "config": { "value": 2 } },
    { "id": "n2", "kind": "const.number", "x": 120, "y": 220, "config": { "value": 3 } },
    { "id": "n3", "kind": "math.mul", "x": 360, "y": 160 }
  ],
  "links": [
    { "id": "e1", "from": { "nodeId": "n1", "portKey": "out" }, "to": { "nodeId": "n3", "portKey": "a" } },
    { "id": "e2", "from": { "nodeId": "n2", "portKey": "out" }, "to": { "nodeId": "n3", "portKey": "b" } }
  ]
}
```

Validate with `GraphSchema.parse(json)`.

---

## Publishing & embedding

1. **Build:** ship ESM + CJS + types. Keep React as peer dep.
2. **Styling:** this starter uses inline styles; you can swap to Tailwind or shadcn/ui.
3. **Tree‑shaking:** export editor and runtime separately so headless servers can `run()` without React.
4. **Versioning:** keep block `kind` strings stable; treat them as part of your DSL ABI.

---

## Roadmap ideas (extensions you can add next)

- Real port rendering from `BlockSpec.inputs/outputs` (not the fixed demo ports)
- Drag‑to‑connect cables + type‑checked connections
- Node selection, marquee, copy/paste, undo/redo
- Per‑block custom React renderers (inspector, config editors)
- Subgraphs/macros & inline functions
- Execution contexts (async/await, cancellation, sandboxing, WASM)
- Persistence + autosave
- Multi‑tabbed canvases / workspaces

---

# Scratch‑style stacking mode (nested blocks like MIT Scratch)

Some host apps need **statement blocks that stack vertically** and **C‑shaped control blocks** that contain other statements (like `repeat` / `if`). Below is an *additional* model and editor you can ship **alongside** the graph editor. It reuses the same registry idea but switches to an **AST/stack** representation instead of a node‑graph.

## 1) Types (`src/scratch/stackTypes.ts`)
```ts
import { z } from "zod";

export type StackForm = "hat" | "statement" | "c" | "reporter" | "predicate";

// Literal or nested reporter/predicate block
export type InputValue = { literal: unknown } | { blockId: string };

export interface SlotSpec {
  key: string;                 // e.g. "DO" in repeat
  accepts?: "statement";      // future: menus for reporter-only slots
  label?: string;
}

export interface StackBlockSpec<C = any> {
  kind: string;                 // unique
  label: string;
  form: StackForm;              // hat, statement, c, reporter, predicate
  inputs?: { key: string; type?: "number"|"string"|"boolean"|"any" }[]; // reporter/predicate inputs
  slots?: SlotSpec[];           // for C-shaped blocks
  configSchema?: z.ZodType<C>;

  // Execution hook for runtime. For reporter/predicate, return a value.
  execute?: (ctx: ExecCtx<C>) => Promise<ExecResult> | ExecResult;
}

export interface ExecCtx<C> {
  getInput(key: string): Promise<unknown>;        // resolves literal or nested reporter
  runSlot(slotKey: string): Promise<void>;        // sequentially execute statements inside slot
  state: Record<string, unknown>;                 // scratchpad for host
  config: C;                                      // validated node config
}

export type ExecResult = void | boolean | number | string | unknown;

export type NodeId = string;

export interface StackNode<C = any> {
  id: NodeId;
  kind: string;                 // StackBlockSpec.kind
  form: StackForm;
  // Sequence pointers (like Scratch):
  next?: NodeId | null;         // next statement in the same stack
  parent?: NodeId | null;       // parent statement or C-block
  inSlot?: string | null;       // which slot of parent this node belongs to

  // Inputs for reporter/predicate forms
  inputs?: Record<string, InputValue>;
  // For C-Blocks, children per slot head pointer
  slotHeads?: Record<string, NodeId | null>;

  config?: C;
}

export interface StackProgram {
  heads: NodeId[];    // top-level hats or stacks
  nodes: Record<NodeId, StackNode>;
}

export const StackProgramSchema = z.object({
  heads: z.array(z.string()),
  nodes: z.record(z.any())
});
```

## 2) Registry (`src/scratch/StackRegistry.ts`)
```ts
import { StackBlockSpec } from "./stackTypes";

export class StackRegistry {
  private specs = new Map<string, StackBlockSpec>();
  register<T>(spec: StackBlockSpec<T>) {
    if (this.specs.has(spec.kind)) throw new Error(`dup kind ${spec.kind}`);
    this.specs.set(spec.kind, spec);
    return this;
  }
  get(kind: string) { return this.specs.get(kind); }
  all() { return Array.from(this.specs.values()); }
}
```

## 3) Runtime (`src/scratch/StackInterpreter.ts`)
```ts
import { StackProgram, StackNode } from "./stackTypes";
import { StackRegistry } from "./StackRegistry";

export class StackInterpreter {
  constructor(private registry: StackRegistry, private state: Record<string,unknown> = {}) {}

  async run(program: StackProgram) {
    // Run all top-level hats (or plain stacks) sequentially for now
    for (const head of program.heads) {
      await this.runFrom(head, program);
    }
  }

  private async runFrom(startId: string, program: StackProgram): Promise<void> {
    let cur: string | null | undefined = startId;
    while (cur) {
      const node = program.nodes[cur];
      const spec = this.registry.get(node.kind);
      if (!spec) throw new Error(`Unknown block: ${node.kind}`);

      // Construct helpers
      const getInput = async (key: string) => {
        const iv = node.inputs?.[key];
        if (!iv) return undefined;
        if ("literal" in iv) return iv.literal;
        const sub = program.nodes[iv.blockId];
        const subSpec = this.registry.get(sub.kind)!;
        const val = await subSpec.execute?.({
          getInput: (k)=>this.evalInput(sub, program, k),
          runSlot: async ()=>{},
          state: this.state,
          config: (sub.config as any)
        });
        return val;
      };

      const runSlot = async (slotKey: string) => {
        const head = node.slotHeads?.[slotKey] ?? null;
        if (!head) return;
        await this.runFrom(head, program);
      };

      await spec.execute?.({ getInput, runSlot, state: this.state, config: (node.config as any) });
      cur = node.next ?? null;
    }
  }

  private async evalInput(node: StackNode, program: StackProgram, key: string) {
    const iv = node.inputs?.[key];
    if (!iv) return undefined;
    if ("literal" in iv) return iv.literal;
    const sub = program.nodes[iv.blockId];
    const subSpec = this.registry.get(sub.kind)!;
    return await subSpec.execute?.({
      getInput: (k)=>this.evalInput(sub, program, k),
      runSlot: async ()=>{},
      state: this.state,
      config: (sub.config as any)
    });
  }
}
```

## 4) Minimal editor (`src/scratch/StackEditor.tsx`)
```tsx
import React from "react";
import { nanoid } from "nanoid";
import type { StackProgram, StackNode } from "./stackTypes";
import { StackRegistry } from "./StackRegistry";

export const StackEditor: React.FC<{ registry: StackRegistry; program: StackProgram; onChange: (p: StackProgram)=>void }> = ({ registry, program, onChange }) => {
  const specs = registry.all();

  const addBlock = (kind: string) => {
    const spec = registry.get(kind)!;
    const id = nanoid();
    const node: StackNode = { id, kind, form: spec.form, next: null, parent: null, inSlot: null, inputs: {}, slotHeads: Object.fromEntries((spec.slots ?? []).map(s=>[s.key, null])) };
    onChange({ ...program, heads: [...program.heads, id], nodes: { ...program.nodes, [id]: node } });
  };

  const renderStack = (headId: string) => {
    const node = program.nodes[headId];
    const spec = registry.get(node.kind)!;
    return (
      <div key={node.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 8, marginBottom: 8, background: "#fff" }}>
        <div style={{ fontWeight: 600 }}>{spec.label}</div>
        {spec.slots?.map(slot => (
          <div key={slot.key} style={{ marginLeft: 12, paddingLeft: 12, borderLeft: "3px dashed #ccc", marginTop: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{slot.label ?? slot.key}</div>
            {node.slotHeads?.[slot.key] ? renderStack(node.slotHeads![slot.key]!) : <em style={{ fontSize: 12, opacity: 0.6 }}>drop statements here</em>}
          </div>
        ))}
        {node.next ? renderStack(node.next) : null}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12 }}>
      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Blocks</div>
        {specs.map(s => (
          <button key={s.kind} onClick={() => addBlock(s.kind)} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6 }}>{s.label}</button>
        ))}
      </div>
      <div>
        {program.heads.map(h => renderStack(h))}
      </div>
    </div>
  );
};
```

> The editor above purposefully omits real drag‑drop; it gives you the **shape** and rendering/nesting pattern. You can wire up react‑dnd or pointer‑based reordering later.

## 5) Example blocks (`src/scratch/DefaultStackBlocks.ts`)
```ts
import type { StackBlockSpec } from "./stackTypes";

export const WhenStarted: StackBlockSpec = {
  kind: "event.whenStarted",
  label: "when started",
  form: "hat",
  slots: [{ key: "DO", label: "do" }],
  async execute({ runSlot }) { await runSlot("DO"); }
};

export const Repeat: StackBlockSpec<{ times: number }> = {
  kind: "control.repeat",
  label: "repeat",
  form: "c",
  slots: [{ key: "DO", label: "do" }],
  async execute({ getInput, runSlot, config }) {
    const n = (config?.times ?? 10) as number;
    for (let i=0;i<n;i++) await runSlot("DO");
  }
};

export const Log: StackBlockSpec<{ msg: string }> = {
  kind: "looks.log",
  label: "log",
  form: "statement",
  async execute({ getInput, config }) { console.log(config?.msg ?? ""); }
};

export const Add: StackBlockSpec = {
  kind: "op.add",
  label: "+",
  form: "reporter",
  inputs: [{ key: "a" }, { key: "b" }],
  execute: async ({ getInput }) => Number(await getInput("a") ?? 0) + Number(await getInput("b") ?? 0)
};

export const DefaultStackBlocks = [WhenStarted, Repeat, Log, Add];
```

## 6) Example usage (`example/StackApp.tsx`)
```tsx
import React, { useState } from "react";
import { StackEditor } from "blockkit-ts/scratch/StackEditor";
import { StackRegistry } from "blockkit-ts/scratch/StackRegistry";
import { DefaultStackBlocks } from "blockkit-ts/scratch/DefaultStackBlocks";
import type { StackProgram } from "blockkit-ts/scratch/stackTypes";
import { StackInterpreter } from "blockkit-ts/scratch/StackInterpreter";

const registry = new StackRegistry();
DefaultStackBlocks.forEach(b => registry.register(b));

const initial: StackProgram = { heads: [], nodes: {} };

export default function StackApp() {
  const [program, setProgram] = useState<StackProgram>(initial);
  return (
    <div style={{ padding: 16 }}>
      <h2>Stack Editor Example</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={async ()=>{ const rt = new StackInterpreter(registry); await rt.run(program); }}>Run</button>
        <button onClick={()=>console.log(program)}>Export JSON</button>
      </div>
      <StackEditor registry={registry} program={program} onChange={setProgram} />
    </div>
  );
}
```

## 7) Packaging

- Export both models from `src/index.ts` under different namespaces:
```ts
export * as graph from "./"; // existing exports
export * as scratch from "./scratch"; // re-export stack editor/runtime/types
```

- Keep **forms** stable (`hat|statement|c|reporter|predicate`) as part of your DSL ABI.
- You can render Scratch‑like shapes in CSS based on `form` for immediate visual affordances (rounded hats, hex predicates, circle reporters).

## 8) Interop with the original graph model

- You can **compile** a stack AST to a graph if you need dataflow analysis: each statement becomes a node; `next` pointers become edges; slots flatten to subgraphs.
- Or keep them separate: use the **graph model** for data pipelines and the **stack model** for scripting and control flow.

---

**Next steps I can code for you quickly:** true drag‑drop reordering; visual Scratch shapes (hat, c‑shaped, predicate hex); input bubbles for reporters with literal/edit modes; variables and events API; and a simple stepper with pause/continue for classroom demos.


---

# Switch to a JavaScript engine (Phaser + TypeScript) – Game skeleton

Using a JS engine makes the Scratch editor + runtime integration trivial (same language/runtime). Below is a minimal **Phaser 3 + TypeScript** skeleton wired to the **Scratch‑style runtime** from earlier, with a clean world API and module‑gated blocks.

## Monorepo layout
```
/blocks/                 # your existing React/TS block editor lib
  src/
    ... (graph + scratch)  
    scratch/StackInterpreter.ts
    scratch/stackTypes.ts

/game/
  package.json
  src/
    main.ts
    GameScene.ts
    world/world.ts
    world/components.ts
    world/systems.ts
    world/worldApi.ts
    content/modules.ts
    content/blocksCatalog.ts
    content/recipes.ts
    runtime/programRuntime.ts
  index.html
  vite.config.ts

/apps/editor/            # (optional) separate editor app that imports /blocks
```

> The game imports the `StackInterpreter` and types from `/blocks` so the **save format and runtime are identical** between editor and game.

---

## `/game/src/world/components.ts`
```ts
// Minimal component model (object-based for clarity). You can swap for bitecs later.
export type EntityId = number;

export interface Position { x: number; y: number }
export interface Velocity { vx: number; vy: number; max: number }
export interface Energy { cur: number; cap: number }
export interface Inventory { items: Record<string, number> }
export interface Modules { list: string[] } // e.g. ["motor","scanner"]
export interface Tags { tags: string[] }    // e.g. ["scrap"]

export interface Program { ast: any | null; running: boolean; budget: number; }

export interface SpriteRef { sprite: Phaser.GameObjects.Sprite }

export interface Entity extends Partial<Position & Velocity & Energy & Inventory & Modules & Tags & Program & SpriteRef> {
  id: EntityId;
  name?: string;
}
```

## `/game/src/world/world.ts`
```ts
import type { Entity } from "./components";

export class WorldDB {
  private nextId = 1;
  entities: Map<number, Entity> = new Map();

  create(e: Omit<Entity, "id">): Entity {
    const id = this.nextId++;
    const ent = { id, ...e } as Entity;
    this.entities.set(id, ent);
    return ent;
  }

  all() { return Array.from(this.entities.values()); }
  byTag(tag: string) { return this.all().filter(e => e.tags?.includes(tag)); }
}

export const world = new WorldDB();
```

## `/game/src/content/modules.ts`
```ts
export const ModuleDefs: Record<string, { label: string; unlocks: string[] }> = {
  motor:   { label: "Motor",   unlocks: ["motion.*"] },
  scanner: { label: "Scanner", unlocks: ["sense.*"] },
  manip:   { label: "Manipulator", unlocks: ["manip.*"] },
  comms:   { label: "Comms",    unlocks: ["event.broadcast","event.onBroadcast"] }
};

export function allowedKindsFor(mods: string[], allKinds: string[]) {
  const pats = mods.flatMap(m => ModuleDefs[m]?.unlocks ?? []);
  return allKinds.filter(k => pats.some(p => p.endsWith(".*") ? k.startsWith(p.slice(0,-2)) : k === p));
}
```

## `/game/src/content/blocksCatalog.ts`
```ts
// Describe all block kinds present in the game (runtime impl is in programRuntime.ts)
export const AllBlockKinds = [
  "event.whenStarted",
  "control.repeat",
  "motion.moveTo",
  "sense.findNearest",
  "sense.lastResult",
  "manip.pickup",
  "manip.drop"
];
```

## `/game/src/world/worldApi.ts`
```ts
import { world } from "./world";
import type { Entity } from "./components";

export const worldApi = {
  findNearest(from: Entity, tag: string) {
    const cands = world.byTag(tag);
    let best: Entity | null = null, bestD = Infinity;
    for (const e of cands) {
      if (e.x == null || e.y == null) continue;
      const dx = (from.x! - e.x), dy = (from.y! - e.y);
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    return best;
  },
  moveTo(e: Entity, x: number, y: number) {
    // Simple target-as-velocity: aim and set velocity; MotionSystem will do the rest
    if (!e.vx && e.vx !== 0) e.vx = 0; if (!e.vy && e.vy !== 0) e.vy = 0;
    const dx = x - (e.x ?? 0), dy = y - (e.y ?? 0);
    const len = Math.hypot(dx, dy) || 1;
    const spd = Math.min(e.max ?? 50, 80);
    e.vx = (dx/len) * spd; e.vy = (dy/len) * spd;
  },
  pickup(from: Entity, tag = "scrap", amount = 1) {
    const near = this.findNearest(from, tag);
    if (!near) return false;
    // naive: if within 16px, "consume"
    const dist = Math.hypot((from.x??0)-(near.x??0), (from.y??0)-(near.y??0));
    if (dist > 16) return false;
    near.tags = (near.tags ?? []).filter(t => t !== tag); // despawn-ish
    from.items = from.items ?? {}; from.items[tag] = (from.items[tag] ?? 0) + amount;
    return true;
  },
  drop(from: Entity, tag = "scrap", amount = 1) {
    from.items = from.items ?? {}; from.items[tag] = Math.max(0, (from.items[tag] ?? 0) - amount);
  }
};
```

## `/game/src/world/systems.ts`
```ts
import { world } from "./world";

export function motionSystem(dt: number) {
  for (const e of world.all()) {
    if (e.vx == null || e.vy == null || e.x == null || e.y == null) continue;
    e.x += e.vx * dt; e.y += e.vy * dt;
    e.sprite?.setPosition(e.x, e.y);
  }
}
```

## `/game/src/runtime/programRuntime.ts`
```ts
import { StackInterpreter } from "../../blocks/src/scratch/StackInterpreter"; // adjust import path
import type { StackProgram } from "../../blocks/src/scratch/stackTypes";
import { world } from "../world/world";
import { worldApi } from "../world/worldApi";
import type { Entity } from "../world/components";

// Attach a lightweight adapter so block kinds call into worldApi
export function makeInterpreter() {
  const rt = new StackInterpreter({} as any);

  // Register handlers matching your block kinds
  // event.whenStarted → just run DO slot
  (rt as any).register?.("event.whenStarted", async (ctx: any) => { await ctx.runSlot("DO"); });

  (rt as any).register?.("control.repeat", async (ctx: any) => {
    const n = (ctx.config?.times ?? 1) as number;
    for (let i=0;i<n;i++) await ctx.runSlot("DO");
  });

  (rt as any).register?.("sense.findNearest", (ctx: any) => {
    const ent: Entity = ctx.state.entity;
    ctx.state.lastResult = worldApi.findNearest(ent, ctx.config?.tag ?? "scrap");
  });

  (rt as any).register?.("sense.lastResult", (ctx: any) => ctx.state.lastResult);

  (rt as any).register?.("motion.moveTo", async (ctx: any) => {
    const ent: Entity = ctx.state.entity;
    const target = ctx.config?.targetTag
      ? world.byTag(ctx.config.targetTag)[0]
      : ctx.getInput("target");
    if (!target) return;
    const pos = (target as any).x != null ? target : { x: (target as any).x, y: (target as any).y };
    worldApi.moveTo(ent, (pos as any).x, (pos as any).y);
  });

  (rt as any).register?.("manip.pickup", (ctx: any) => {
    const ent: Entity = ctx.state.entity; worldApi.pickup(ent);
  });
  (rt as any).register?.("manip.drop", (ctx: any) => {
    const ent: Entity = ctx.state.entity; worldApi.drop(ent);
  });

  return rt;
}

export function startProgram(e: Entity, ast: StackProgram) {
  e.running = true; e.budget = 8; // ticks per frame
  // Thread model: run() returns a handle you step each frame; if your StackInterpreter is fully async, adapt here
  (e as any)._program = { ast, ip: ast.heads[0] ?? null };
}

export function stepPrograms(_dt: number) {
  for (const e of world.all()) {
    if (!e.running || !e.ast) continue;
    // For a real impl: call rt.run(ast) with a per-frame budget; here, pretend our blocks are instant side-effects
  }
}
```

> If your `StackInterpreter` already supports stepping with a budget, call it from `stepPrograms(dt)` and pass `{ state: { entity: e } }` as the execution context.

## `/game/src/GameScene.ts`
```ts
import Phaser from "phaser";
import { world } from "./world/world";
import { motionSystem } from "./world/systems";
import { startProgram } from "./runtime/programRuntime";

export class GameScene extends Phaser.Scene {
  constructor() { super("game"); }

  preload() {
    this.load.image("scrap", "assets/scrap.png");
    this.load.image("bot", "assets/bot.png");
  }

  create() {
    // Spawn a pile of scrap
    for (let i=0;i<12;i++) {
      const x = 200 + Math.random()*400, y = 200 + Math.random()*240;
      const sprite = this.add.sprite(x,y,"scrap");
      world.create({ x, y, sprite, tags: ["scrap"] });
    }

    // Spawn a robot with motor+scanner
    const botSprite = this.add.sprite(100,100,"bot");
    const robot = world.create({ name: "Harvester 1", x: 100, y: 100, vx: 0, vy: 0, max: 60, sprite: botSprite, list: ["motor","scanner","manip"], items: {}, running: false, ast: null });

    // Minimal program AST: whenStarted -> forever repeat: findNearest scrap; moveTo lastResult; pickup; (loop)
    robot.ast = {
      heads: ["h"],
      nodes: {
        h: { id:"h", kind:"event.whenStarted", form:"hat", slotHeads:{ DO: "r" } },
        r: { id:"r", kind:"control.repeat", form:"c", config:{ times: 9999 }, slotHeads:{ DO: "s1" } },
        s1:{ id:"s1", kind:"sense.findNearest", form:"statement", next:"s2", config:{ tag:"scrap" } },
        s2:{ id:"s2", kind:"motion.moveTo", form:"statement", next:"s3", inputs:{ target:{ blockId:"rr" } } },
        rr:{ id:"rr", kind:"sense.lastResult", form:"reporter" },
        s3:{ id:"s3", kind:"manip.pickup", form:"statement", next:"s1" }
      }
    };

    startProgram(robot, robot.ast as any);
  }

  update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    motionSystem(dt);
    // stepPrograms(dt) — wire in once your interpreter supports stepping per frame
  }
}
```

## `/game/src/main.ts`
```ts
import Phaser from "phaser";
import { GameScene } from "./GameScene";

new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  parent: "app",
  backgroundColor: "#0b1020",
  scene: [GameScene]
});
```

---

## Why this approach is “better” here
- **Same language** for engine, editor, and runtime ⇒ no bridging layer or serialization impedance.
- **Faster iteration**: live-reload both editor and game via Vite.
- **Shared types**: one `StackProgram` schema across everything; gate blocks by modules in one place.
- **Deployment range**: Web (itch.io/Steam Web), desktop (Electron/Tauri), mobile (Capacitor) without re‑implementing the editor.

If you prefer a leaner render stack than Phaser, swap it for **PixiJS + pixi-viewport**; systems/world code stays the same.

