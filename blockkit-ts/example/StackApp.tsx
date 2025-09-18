import React, { useState } from "react";
import { scratch } from "blockkit-ts";

const { StackEditor, StackRegistry, DefaultStackBlocks, StackInterpreter } = scratch;
type StackProgram = scratch.StackProgram;

const registry = new StackRegistry();
DefaultStackBlocks.forEach(b => registry.register(b));

const initial: StackProgram = { heads: [], nodes: {} };

export default function StackApp() {
  const [program, setProgram] = useState(initial);
  
  const runProgram = async () => {
    console.clear();
    console.log("🎯 Running Scratch-style program...");
    console.log("=====================================");
    
    try {
      const runtime = new StackInterpreter(registry);
      await runtime.run(program);
      console.log("=====================================");
      console.log("✅ Program completed successfully!");
    } catch (error) {
      console.error("❌ Program failed:", error);
    }
  };

  const exportProgram = () => {
    console.log("📄 Program JSON:", JSON.stringify(program, null, 2));
  };

  const clearProgram = () => {
    setProgram({ heads: [], nodes: {} });
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ color: "#333", marginBottom: 8 }}>
        🧩 Scratch-Style Block Editor
      </h2>
      <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
        Build programs by stacking blocks vertically, just like MIT Scratch!
      </p>
      
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button 
          onClick={runProgram}
          style={{
            padding: "8px 16px",
            background: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          ▶️ Run Program
        </button>
        <button 
          onClick={exportProgram}
          style={{
            padding: "8px 16px",
            background: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer"
          }}
        >
          📄 Export JSON
        </button>
        <button 
          onClick={clearProgram}
          style={{
            padding: "8px 16px",
            background: "#f44336",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer"
          }}
        >
          🗑️ Clear
        </button>
      </div>
      
      <div style={{ 
        border: "2px solid #e0e0e0", 
        borderRadius: 12, 
        overflow: "hidden",
        background: "white"
      }}>
        <StackEditor 
          registry={registry} 
          program={program} 
          onChange={setProgram} 
        />
      </div>
      
      <div style={{ marginTop: 16, fontSize: 12, color: "#666" }}>
        <strong>💡 Tips:</strong>
        <ul style={{ margin: "8px 0", paddingLeft: 20 }}>
          <li>Start with a <strong>hat block</strong> (orange) like "when started"</li>
          <li>Add <strong>statement blocks</strong> (blue) for actions</li>
          <li>Use <strong>C-shaped blocks</strong> (yellow) for loops and conditions</li>
          <li>Insert <strong>reporter blocks</strong> (green circles) for values</li>
          <li>Use <strong>predicate blocks</strong> (blue hexagons) for true/false conditions</li>
        </ul>
      </div>
    </div>
  );
}