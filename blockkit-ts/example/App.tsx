import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor, BlockRegistry, DefaultBlocks, useGraph, serialize, Interpreter } from "blockkit-ts";
import StackApp from "./StackApp";

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

const GraphEditor = () => (
  <div>
    <h2>🔗 Graph-Based Editor</h2>
    <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
      Connect blocks with wires to create data flow programs
    </p>
    <Toolbar />
    <BlockEditor registry={registry} height={560} />
  </div>
);

const App = () => {
  const [mode, setMode] = useState<"graph" | "scratch">("graph");

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: "#333", marginBottom: 8 }}>
          🧩 BlockKit TS - Dual Editor Demo
        </h1>
        <p style={{ color: "#666", marginBottom: 16 }}>
          Choose between two different block programming paradigms:
        </p>
        
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setMode("graph")}
            style={{
              padding: "10px 20px",
              background: mode === "graph" ? "#4CAF50" : "#e0e0e0",
              color: mode === "graph" ? "white" : "#333",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            🔗 Graph Editor
          </button>
          <button
            onClick={() => setMode("scratch")}
            style={{
              padding: "10px 20px",
              background: mode === "scratch" ? "#FF9500" : "#e0e0e0",
              color: mode === "scratch" ? "white" : "#333",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            🧩 Scratch Editor
          </button>
        </div>
      </div>

      {mode === "graph" ? <GraphEditor /> : <StackApp />}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);