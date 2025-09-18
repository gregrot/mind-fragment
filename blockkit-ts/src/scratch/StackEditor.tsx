import React, { useState } from "react";
import { nanoid } from "nanoid";
import type { StackProgram, StackNode } from "./stackTypes";
import { StackRegistry } from "./StackRegistry";

export const StackEditor: React.FC<{ 
  registry: StackRegistry; 
  program: StackProgram; 
  onChange: (p: StackProgram) => void 
}> = ({ registry, program, onChange }) => {
  const specs = registry.all();
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const createBlock = (kind: string): StackNode => {
    const spec = registry.get(kind)!;
    const id = nanoid();
    return { 
      id, 
      kind, 
      form: spec.form, 
      next: null, 
      parent: null, 
      inSlot: null, 
      inputs: {}, 
      slotHeads: Object.fromEntries((spec.slots ?? []).map(s => [s.key, null])) 
    };
  };

  const addBlockToMain = (kind: string) => {
    const node = createBlock(kind);
    onChange({ 
      ...program, 
      heads: [...program.heads, node.id], 
      nodes: { ...program.nodes, [node.id]: node } 
    });
  };

  const addBlockToSlot = (kind: string, parentId: string, slotKey: string) => {
    const node = createBlock(kind);
    const updatedNodes = { ...program.nodes };
    
    // Set up the new node
    node.parent = parentId;
    node.inSlot = slotKey;
    updatedNodes[node.id] = node;
    
    // Update parent to point to this node as slot head
    const parent = updatedNodes[parentId];
    if (parent.slotHeads) {
      parent.slotHeads[slotKey] = node.id;
    }
    
    onChange({ ...program, nodes: updatedNodes });
  };

  const addBlockAfter = (kind: string, afterId: string) => {
    const node = createBlock(kind);
    const updatedNodes = { ...program.nodes };
    
    // Get the node we're inserting after
    const afterNode = updatedNodes[afterId];
    
    // Set up the new node
    node.next = afterNode.next;
    node.parent = afterNode.parent;
    node.inSlot = afterNode.inSlot;
    updatedNodes[node.id] = node;
    
    // Update the previous node to point to the new node
    afterNode.next = node.id;
    
    onChange({ ...program, nodes: updatedNodes });
  };

  // Functions for moving existing blocks
  const moveBlockToMain = (nodeId: string) => {
    const updatedNodes = { ...program.nodes };
    const updatedHeads = [...program.heads];
    const node = updatedNodes[nodeId];
    
    if (!node) return;
    
    // Remove from current position
    removeBlockFromCurrentPosition(nodeId, updatedNodes, updatedHeads);
    
    // Add to main area
    node.parent = null;
    node.inSlot = null;
    node.next = null;
    updatedHeads.push(nodeId);
    
    onChange({ heads: updatedHeads, nodes: updatedNodes });
  };

  const moveBlockToSlot = (nodeId: string, parentId: string, slotKey: string) => {
    const updatedNodes = { ...program.nodes };
    const updatedHeads = [...program.heads];
    const node = updatedNodes[nodeId];
    const parent = updatedNodes[parentId];
    
    if (!node || !parent) return;
    
    // Validate that we can move this block to this slot
    const nodeSpec = registry.get(node.kind);
    if (!nodeSpec) return;
    
    // Only allow statement and C-shaped blocks in slots (not hat, reporter, or predicate blocks)
    if (nodeSpec.form !== "statement" && nodeSpec.form !== "c") {
      console.warn(`Cannot move ${nodeSpec.form} block to slot`);
      return;
    }
    
    // Don't allow moving a block into itself or its descendants
    if (isDescendant(parentId, nodeId, updatedNodes)) {
      console.warn("Cannot move block into itself or its descendants");
      return;
    }
    
    // Remove from current position
    removeBlockFromCurrentPosition(nodeId, updatedNodes, updatedHeads);
    
    // Add to slot - if slot is empty, make this the head
    // If slot has content, insert at the beginning
    node.parent = parentId;
    node.inSlot = slotKey;
    
    if (parent.slotHeads) {
      const currentSlotHead = parent.slotHeads[slotKey];
      if (currentSlotHead) {
        // Slot has existing content - insert at the beginning
        node.next = currentSlotHead;
      } else {
        // Slot is empty
        node.next = null;
      }
      parent.slotHeads[slotKey] = nodeId;
    }
    
    onChange({ heads: updatedHeads, nodes: updatedNodes });
  };

  // Helper function to check if targetId is a descendant of nodeId
  const isDescendant = (targetId: string, nodeId: string, nodes: Record<string, StackNode>): boolean => {
    const node = nodes[nodeId];
    if (!node) return false;
    
    // Check if target is in any of this node's slots
    if (node.slotHeads) {
      for (const slotHeadId of Object.values(node.slotHeads)) {
        if (slotHeadId && (slotHeadId === targetId || isDescendant(targetId, slotHeadId, nodes))) {
          return true;
        }
      }
    }
    
    // Check the next chain
    if (node.next && (node.next === targetId || isDescendant(targetId, node.next, nodes))) {
      return true;
    }
    
    return false;
  };

  const moveBlockAfter = (nodeId: string, afterId: string) => {
    const updatedNodes = { ...program.nodes };
    const updatedHeads = [...program.heads];
    const node = updatedNodes[nodeId];
    const afterNode = updatedNodes[afterId];
    
    if (!node || !afterNode) return;
    
    // Don't allow moving a block after itself or its descendants
    if (nodeId === afterId || isDescendant(afterId, nodeId, updatedNodes)) {
      console.warn("Cannot move block after itself or its descendants");
      return;
    }
    
    // Remove from current position
    removeBlockFromCurrentPosition(nodeId, updatedNodes, updatedHeads);
    
    // Insert after the target node
    node.next = afterNode.next;
    node.parent = afterNode.parent;
    node.inSlot = afterNode.inSlot;
    afterNode.next = nodeId;
    
    onChange({ heads: updatedHeads, nodes: updatedNodes });
  };

  const removeBlockFromCurrentPosition = (nodeId: string, updatedNodes: Record<string, StackNode>, updatedHeads: string[]) => {
    const node = updatedNodes[nodeId];
    if (!node) return;

    // Remove from heads if it's a top-level block
    const headIndex = updatedHeads.indexOf(nodeId);
    if (headIndex !== -1) {
      updatedHeads.splice(headIndex, 1);
    }

    // Update parent's slot pointer if this block is in a slot
    if (node.parent && node.inSlot) {
      const parent = updatedNodes[node.parent];
      if (parent && parent.slotHeads && parent.slotHeads[node.inSlot] === nodeId) {
        parent.slotHeads[node.inSlot] = node.next || null;
      }
    }

    // Update previous block's next pointer
    const previousBlock = Object.values(updatedNodes).find(n => n.next === nodeId);
    if (previousBlock) {
      previousBlock.next = node.next;
    }

    // Update next block's parent info if it exists
    if (node.next) {
      const nextNode = updatedNodes[node.next];
      if (nextNode && previousBlock) {
        nextNode.parent = previousBlock.parent;
        nextNode.inSlot = previousBlock.inSlot;
      } else if (nextNode && node.parent && node.inSlot) {
        // If there's no previous block but we're in a slot, the next block becomes the slot head
        nextNode.parent = node.parent;
        nextNode.inSlot = node.inSlot;
      }
    }
  };

  const handleDrop = (e: React.DragEvent, dropTarget: string) => {
    e.preventDefault();
    const dragData = e.dataTransfer.getData("text/plain");
    if (!dragData) return;

    const [targetType, ...params] = dropTarget.split(":");
    
    // Check if we're dragging an existing block or creating a new one
    if (dragData.startsWith("existing:")) {
      // Moving an existing block
      const nodeId = dragData.replace("existing:", "");
      
      switch (targetType) {
        case "main":
          moveBlockToMain(nodeId);
          break;
        case "slot":
          const [parentId, slotKey] = params;
          moveBlockToSlot(nodeId, parentId, slotKey);
          break;
        case "after":
          const [afterId] = params;
          moveBlockAfter(nodeId, afterId);
          break;
      }
    } else {
      // Creating a new block from palette
      const kind = dragData;
      
      switch (targetType) {
        case "main":
          addBlockToMain(kind);
          break;
        case "slot":
          const [parentId, slotKey] = params;
          addBlockToSlot(kind, parentId, slotKey);
          break;
        case "after":
          const [afterId] = params;
          addBlockAfter(kind, afterId);
          break;
      }
    }
    
    setDragOverTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, target: string) => {
    e.preventDefault();
    setDragOverTarget(target);
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const deleteBlock = (nodeId: string) => {
    const node = program.nodes[nodeId];
    if (!node) return;

    const updatedNodes = { ...program.nodes };
    const updatedHeads = [...program.heads];

    // Helper function to recursively delete a node and all its children
    const deleteNodeRecursively = (id: string) => {
      const nodeToDelete = updatedNodes[id];
      if (!nodeToDelete) return;

      // Delete all children in slots first
      if (nodeToDelete.slotHeads) {
        Object.values(nodeToDelete.slotHeads).forEach(slotHeadId => {
          if (slotHeadId) deleteNodeRecursively(slotHeadId);
        });
      }

      // Delete the next chain
      if (nodeToDelete.next) {
        deleteNodeRecursively(nodeToDelete.next);
      }

      // Remove from nodes
      delete updatedNodes[id];
    };

    // If this is a top-level block (in heads), remove it from heads
    const headIndex = updatedHeads.indexOf(nodeId);
    if (headIndex !== -1) {
      updatedHeads.splice(headIndex, 1);
    }

    // If this block has a parent, update the parent's references
    if (node.parent) {
      const parent = updatedNodes[node.parent];
      if (parent) {
        // If this block is in a slot, clear the slot head
        if (node.inSlot && parent.slotHeads) {
          parent.slotHeads[node.inSlot] = node.next || null;
          // Update the next block's parent info if it exists
          if (node.next) {
            const nextNode = updatedNodes[node.next];
            if (nextNode) {
              nextNode.parent = node.parent;
              nextNode.inSlot = node.inSlot;
            }
          }
        }
      }
    }

    // If this block has a previous block, update its next pointer
    const previousBlock = Object.values(updatedNodes).find(n => n.next === nodeId);
    if (previousBlock) {
      previousBlock.next = node.next;
      // Update the next block's parent info if it exists
      if (node.next) {
        const nextNode = updatedNodes[node.next];
        if (nextNode) {
          nextNode.parent = previousBlock.parent;
          nextNode.inSlot = previousBlock.inSlot;
        }
      }
    }

    // Delete this node and all its children
    deleteNodeRecursively(nodeId);

    onChange({ heads: updatedHeads, nodes: updatedNodes });
  };

  const renderStack = (headId: string) => {
    const node = program.nodes[headId];
    const spec = registry.get(node.kind)!;
    
    const getBlockStyle = (form: string) => {
      const baseStyle = {
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 8,
        marginBottom: 4,
        background: "#fff",
        position: "relative" as const,
        cursor: "grab"
      };

      switch (form) {
        case "hat":
          return { ...baseStyle, background: "#ff9500", color: "white", borderRadius: "12px 12px 8px 8px" };
        case "statement":
          return { ...baseStyle, background: "#4c97ff", color: "white" };
        case "c":
          return { ...baseStyle, background: "#ffab19", color: "white" };
        case "reporter":
          return { ...baseStyle, background: "#59c059", color: "white", borderRadius: 20 };
        case "predicate":
          return { ...baseStyle, background: "#5cb3d6", color: "white", borderRadius: "0 20px 20px 0" };
        default:
          return baseStyle;
      }
    };

    const dropZoneStyle = {
      height: 8,
      background: dragOverTarget === `after:${node.id}` ? "#4CAF50" : "transparent",
      border: dragOverTarget === `after:${node.id}` ? "2px dashed #4CAF50" : "2px dashed transparent",
      borderRadius: 4,
      margin: "2px 0",
      transition: "all 0.2s ease"
    };

    return (
      <div key={node.id}>
        <div 
          style={getBlockStyle(spec.form)}
          draggable
          onDragStart={(e) => {
            // For existing blocks, store the node ID with a prefix to distinguish from palette drags
            e.dataTransfer.setData("text/plain", `existing:${node.id}`);
            e.dataTransfer.effectAllowed = "move";
          }}
        >
          <div style={{ 
            fontWeight: 600, 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center" 
          }}>
            <span>{spec.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteBlock(node.id);
              }}
              style={{
                background: "rgba(255, 255, 255, 0.2)",
                border: "1px solid rgba(255, 255, 255, 0.3)",
                borderRadius: 4,
                color: "white",
                cursor: "pointer",
                fontSize: 12,
                padding: "2px 6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 20,
                height: 20
              }}
              title="Delete block"
            >
              🗑️
            </button>
          </div>
          
          {/* Render input fields for reporters/predicates */}
          {spec.inputs?.map(input => (
            <div key={input.key} style={{ marginTop: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>{input.key}: </span>
              <input 
                type="text" 
                placeholder={`${input.type || 'any'}`}
                style={{ 
                  fontSize: 12, 
                  padding: "2px 6px", 
                  borderRadius: 4, 
                  border: "1px solid rgba(255,255,255,0.3)",
                  background: "rgba(255,255,255,0.2)",
                  color: "white"
                }}
              />
            </div>
          ))}

          {/* Render slots for C-shaped blocks */}
          {spec.slots?.map(slot => (
            <div key={slot.key} style={{ 
              marginLeft: 12, 
              paddingLeft: 12, 
              borderLeft: "3px dashed rgba(255,255,255,0.4)", 
              marginTop: 6,
              minHeight: 40
            }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                {slot.label ?? slot.key}
              </div>
              {node.slotHeads?.[slot.key] ? 
                renderStack(node.slotHeads![slot.key]!) : 
                <div 
                  style={{ 
                    fontSize: 12, 
                    opacity: 0.6, 
                    fontStyle: "italic",
                    padding: 8,
                    border: dragOverTarget === `slot:${node.id}:${slot.key}` ? "2px dashed #4CAF50" : "1px dashed rgba(255,255,255,0.3)",
                    borderRadius: 4,
                    background: dragOverTarget === `slot:${node.id}:${slot.key}` ? "rgba(76, 175, 80, 0.1)" : "rgba(255,255,255,0.1)",
                    minHeight: 30,
                    transition: "all 0.2s ease"
                  }}
                  onDragOver={(e) => handleDragOver(e, `slot:${node.id}:${slot.key}`)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, `slot:${node.id}:${slot.key}`)}
                >
                  drop statements here
                </div>
              }
            </div>
          ))}
        </div>
        
        {/* Drop zone after this block */}
        <div
          style={dropZoneStyle}
          onDragOver={(e) => handleDragOver(e, `after:${node.id}`)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, `after:${node.id}`)}
        />
        
        {node.next ? renderStack(node.next) : null}
      </div>
    );
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, height: 600 }}>
      <div style={{ 
        border: "1px solid #eee", 
        borderRadius: 8, 
        padding: 8, 
        overflow: "auto",
        background: "#f8f9fa"
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Blocks</div>
        
        {/* Group blocks by form */}
        {["hat", "statement", "c", "reporter", "predicate"].map(form => {
          const blocksOfForm = specs.filter(s => s.form === form);
          if (blocksOfForm.length === 0) return null;
          
          return (
            <div key={form} style={{ marginBottom: 12 }}>
              <div style={{ 
                fontSize: 11, 
                fontWeight: 600, 
                textTransform: "uppercase", 
                color: "#666", 
                marginBottom: 4 
              }}>
                {form}
              </div>
              {blocksOfForm.map(s => (
                <div
                  key={s.kind} 
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", s.kind);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  style={{ 
                    display: "block", 
                    width: "100%", 
                    textAlign: "left", 
                    marginBottom: 4,
                    padding: "6px 8px",
                    border: "1px solid #ddd",
                    borderRadius: 4,
                    background: "white",
                    cursor: "grab",
                    fontSize: 12,
                    userSelect: "none"
                  }}
                >
                  {s.label}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      
      <div 
        style={{ 
          padding: 12, 
          background: "#f0f0f0", 
          borderRadius: 8, 
          overflow: "auto",
          minHeight: 400
        }}
        onDragOver={(e) => {
          if (program.heads.length === 0) {
            handleDragOver(e, "main");
          }
        }}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          if (program.heads.length === 0) {
            handleDrop(e, "main");
          }
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 12, color: "#333" }}>
          Script Area
        </div>
        {program.heads.length === 0 ? (
          <div style={{ 
            fontSize: 14, 
            color: "#666", 
            fontStyle: "italic", 
            textAlign: "center",
            padding: 40,
            border: dragOverTarget === "main" ? "2px dashed #4CAF50" : "2px dashed transparent",
            borderRadius: 8,
            background: dragOverTarget === "main" ? "rgba(76, 175, 80, 0.1)" : "transparent",
            transition: "all 0.2s ease"
          }}>
            Drag blocks here to start building your script
          </div>
        ) : (
          <div>
            {program.heads.map(h => renderStack(h))}
            {/* Drop zone at the end for adding new top-level blocks */}
            <div
              style={{
                height: 20,
                background: dragOverTarget === "main" ? "#4CAF50" : "transparent",
                border: dragOverTarget === "main" ? "2px dashed #4CAF50" : "2px dashed transparent",
                borderRadius: 4,
                margin: "8px 0",
                transition: "all 0.2s ease"
              }}
              onDragOver={(e) => handleDragOver(e, "main")}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, "main")}
            />
          </div>
        )}
      </div>
    </div>
  );
};