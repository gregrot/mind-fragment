import React, { useMemo, useRef, useState } from "react";
import { useGraph } from "./Graph";
import type { BlockRegistry } from "./BlockRegistry";
import type { NodeInstance } from "./types";

interface Props { registry: BlockRegistry; height?: number; }

export const BlockEditor: React.FC<Props> = ({ registry, height = 480 }) => {
  const { nodes, links, addNode, moveNode, updateNode, addLink, removeNode } = useGraph();
  const palette = useMemo(() => registry.all(), [registry]);

  const onCanvasDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    const kind = e.dataTransfer.getData("text/plain");
    const rect = (e.target as HTMLElement).getBoundingClientRect();

    // Initialize with default config for number blocks
    let config = undefined;
    if (kind === "const.number") {
      config = { value: Math.floor(Math.random() * 101) }; // Random 0-100
    }

    addNode({
      kind,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      config
    });
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
          <NodeCard key={n.id} node={n} registry={registry}
            onMove={(x, y) => moveNode(n.id, x, y)}
            onUpdate={(updates) => updateNode(n.id, updates)}
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
  registry: BlockRegistry;
  onMove: (x: number, y: number) => void;
  onUpdate: (updates: Partial<NodeInstance>) => void;
  onRemove: () => void;
  onPortClick: (portKey: string, side: "in" | "out") => void;
}> = ({ node, registry, onMove, onUpdate, onRemove, onPortClick }) => {
  const dragging = useRef<{ dx: number; dy: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const spec = registry.get(node.kind);

  const handleValueClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.kind === "const.number") {
      setEditValue(String(node.config?.value || 0));
      setEditing(true);
    }
  };

  const handleValueSubmit = () => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue)) {
      onUpdate({ config: { ...node.config, value: numValue } });
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleValueSubmit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  return (
    <div
      style={{ position: "absolute", left: node.x, top: node.y, width: 180, background: "#fefefe", border: "1px solid #ddd", borderRadius: 8, boxShadow: "0 2px 6px rgba(0,0,0,0.06)" }}
    >
      <div
        onMouseDown={(e) => {
          if (!editing) {
            dragging.current = { dx: e.clientX - node.x, dy: e.clientY - node.y };
          }
        }}
        onMouseMove={(e) => { if (dragging.current && !editing) onMove(e.clientX - dragging.current.dx, e.clientY - dragging.current.dy); }}
        onMouseUp={() => (dragging.current = null)}
        style={{ padding: 8, borderBottom: "1px solid #eee", cursor: editing ? "default" : "move", borderTopLeftRadius: 8, borderTopRightRadius: 8, background: "#f7f7f7", fontWeight: 600 }}
      >
        {spec?.label || node.kind}
        {node.kind === "const.number" && node.config?.value !== undefined && (
          editing ? (
            <input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleValueSubmit}
              onKeyDown={handleKeyDown}
              autoFocus
              style={{
                marginLeft: 8,
                fontSize: 12,
                width: 50,
                border: "1px solid #ccc",
                borderRadius: 3,
                padding: "2px 4px"
              }}
            />
          ) : (
            <span
              onClick={handleValueClick}
              style={{
                marginLeft: 8,
                fontSize: 12,
                color: "#666",
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: 3,
                background: "#e5e7eb"
              }}
              title="Click to edit"
            >
              ({node.config.value})
            </span>
          )
        )}
        <button onClick={onRemove} style={{ float: "right", fontSize: 12 }}>✕</button>
      </div>

      <div style={{ padding: 8, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          {/* Render actual input ports from spec */}
          {spec?.inputs?.map(input => (
            <Port
              key={input.key}
              side="in"
              label={input.label || input.key}
              onClick={() => onPortClick(input.key, "in")}
            />
          ))}
        </div>
        <div>
          {/* Render actual output ports from spec */}
          {spec?.outputs?.map(output => (
            <Port
              key={output.key}
              side="out"
              label={output.label || output.key}
              onClick={() => onPortClick(output.key, "out")}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const Port: React.FC<{ side: "in" | "out"; label: string; onClick: () => void }> = ({ side, label, onClick }) => (
  <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
    {side === "in" ? <span style={{ width: 10, height: 10, background: "#2d6cdf", borderRadius: 9999 }} /> : null}
    <span style={{ fontSize: 12, color: "#444" }}>{label}</span>
    {side === "out" ? <span style={{ width: 10, height: 10, background: "#16a34a", borderRadius: 9999 }} /> : null}
  </div>
);