/**
 * Main React component for the visual stack-based block editor
 */

import React, { useState, useCallback, useEffect } from 'react';
import { StackRegistry } from './StackRegistry';
import { StackProgram, StackBlock, StackBlockSpec } from './types';
import { serializeProgram } from './StackSerializer';

// Add CSS animation for drop indicator
const pulseKeyframes = `
  @keyframes pulse {
    0% { opacity: 0.5; }
    50% { opacity: 1; }
    100% { opacity: 0.5; }
  }
`;

// Inject the CSS into the document head
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = pulseKeyframes;
  document.head.appendChild(style);
}

/**
 * Props for the StackEditor component
 */
interface StackEditorProps {
  /** Registry containing available block specifications */
  registry: StackRegistry;
  /** Current program state (optional, defaults to empty program) */
  program?: StackProgram;
  /** Callback fired when the program changes */
  onChange?: (program: StackProgram) => void;
  /** Callback fired when user requests program execution */
  onExecute?: (program: StackProgram) => void;
  /** Callback fired when program is serialized (for saving) */
  onSave?: (serializedProgram: string) => void;
  /** Callback fired when user requests to load a program */
  onLoad?: () => void;
}

/**
 * Generate a unique ID for new blocks
 */
function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a new block instance from a block specification
 */
function createBlockFromSpec(spec: StackBlockSpec): StackBlock {
  const block: StackBlock = {
    id: generateBlockId(),
    kind: spec.kind,
    form: spec.form,
  };

  // Initialize inputs with default values
  if (spec.inputs && spec.inputs.length > 0) {
    block.inputs = {};
    for (const input of spec.inputs) {
      // Set default literal values based on input type
      let defaultValue: unknown = '';
      if (input.type === 'number') defaultValue = 0;
      if (input.type === 'boolean') defaultValue = false;
      
      block.inputs[input.key] = { literal: defaultValue };
    }
  }

  // Initialize slots for C-blocks
  if (spec.slots && spec.slots.length > 0) {
    block.slots = {};
    for (const slot of spec.slots) {
      block.slots[slot.key] = [];
    }
  }

  return block;
}

/**
 * Component for rendering individual blocks
 */
interface BlockComponentProps {
  block: StackBlock;
  spec: StackBlockSpec;
  onBlockChange?: (updatedBlock: StackBlock) => void;
  onBlockMove?: (blockId: string) => void;
  registry?: StackRegistry;
  isDraggable?: boolean;
}

function BlockComponent({ block, spec, onBlockChange, onBlockMove, registry, isDraggable = true }: BlockComponentProps): JSX.Element {
  const handleInputChange = useCallback((inputKey: string, value: unknown) => {
    if (!onBlockChange) return;
    
    const updatedBlock = {
      ...block,
      inputs: {
        ...block.inputs,
        [inputKey]: { literal: value }
      }
    };
    onBlockChange(updatedBlock);
  }, [block, onBlockChange]);

  const renderInput = (inputSpec: { key: string; type?: string }) => {
    const inputValue = block.inputs?.[inputSpec.key];
    const currentValue = inputValue && 'literal' in inputValue ? inputValue.literal : '';
    
    return (
      <input
        key={inputSpec.key}
        type={inputSpec.type === 'number' ? 'number' : 'text'}
        value={String(currentValue)}
        onChange={(e) => {
          const value = inputSpec.type === 'number' ? 
            parseFloat(e.target.value) || 0 : 
            e.target.value;
          handleInputChange(inputSpec.key, value);
        }}
        style={{
          border: '1px solid #ccc',
          borderRadius: '3px',
          padding: '2px 4px',
          margin: '0 2px',
          minWidth: '40px'
        }}
      />
    );
  };

  const renderLabel = () => {
    if (!spec.inputs || spec.inputs.length === 0) {
      return spec.label;
    }

    // Replace {} placeholders with input fields
    const parts = spec.label.split('{}');
    const result: React.ReactNode[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      result.push(parts[i]);
      if (i < spec.inputs.length) {
        result.push(renderInput(spec.inputs[i]));
      }
    }
    
    return result;
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!isDraggable) return;
    
    // Store the block data for movement
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'existing-block',
      blockId: block.id,
      block: block
    }));
    e.dataTransfer.effectAllowed = 'move';
    
    // Add visual feedback
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Reset visual feedback
    (e.currentTarget as HTMLElement).style.opacity = '1';
  };

  // Different styling for C-blocks to create the C-shape
  const blockStyle: React.CSSProperties = {
    display: spec.form === 'c' ? 'block' : 'inline-block',
    backgroundColor: getBlockColor(spec.form),
    color: 'white',
    padding: spec.form === 'c' ? '6px 8px 4px 8px' : '4px 8px',
    margin: '2px',
    borderRadius: spec.form === 'c' ? '8px 8px 0 0' : '4px',
    cursor: isDraggable ? 'grab' : 'default',
    userSelect: 'none',
    fontSize: '12px',
    fontFamily: 'Arial, sans-serif',
    minWidth: spec.form === 'c' ? '120px' : 'auto',
    position: 'relative'
  };

  const renderCBlockSlots = () => {
    if (spec.form !== 'c' || !spec.slots) return null;

    return (
      <div style={{
        backgroundColor: getBlockColor(spec.form),
        borderRadius: '0 0 8px 8px',
        marginTop: '0px',
        position: 'relative'
      }}>
        {spec.slots.map((slot, slotIndex) => (
          <div key={slot.key} style={{
            position: 'relative',
            marginBottom: slotIndex === spec.slots!.length - 1 ? '0' : '4px'
          }}>
            {/* C-block notch/indent */}
            <div style={{
              display: 'flex',
              alignItems: 'stretch',
              minHeight: '32px'
            }}>
              {/* Left side of C-block */}
              <div style={{
                width: '12px',
                backgroundColor: getBlockColor(spec.form),
                borderRadius: slotIndex === 0 ? '0 0 0 4px' : '0',
                flexShrink: 0
              }} />
              
              {/* Slot content area */}
              <div style={{
                flex: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                margin: '2px',
                padding: '4px',
                minHeight: '24px',
                position: 'relative'
              }}>
                {/* Slot label */}
                {slot.label && (
                  <div style={{
                    fontSize: '10px',
                    opacity: 0.9,
                    marginBottom: '2px',
                    fontWeight: 'bold'
                  }}>
                    {slot.label}
                  </div>
                )}
                
                {/* Nested sequence */}
                <SequenceComponent 
                  blocks={block.slots?.[slot.key] || []} 
                  registry={registry}
                  onSequenceChange={(newBlocks) => {
                    if (!onBlockChange) return;
                    const updatedBlock = {
                      ...block,
                      slots: {
                        ...block.slots,
                        [slot.key]: newBlocks
                      }
                    };
                    onBlockChange(updatedBlock);
                  }}
                  onBlockMove={onBlockMove}
                  parentBlockId={block.id}
                  slotKey={slot.key}
                  isNestedInCBlock={true}
                />
              </div>
              
              {/* Right side of C-block */}
              <div style={{
                width: '12px',
                backgroundColor: getBlockColor(spec.form),
                borderRadius: slotIndex === spec.slots!.length - 1 ? '0 0 4px 0' : '0',
                flexShrink: 0
              }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div 
      style={blockStyle}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {renderLabel()}
      {renderCBlockSlots()}
    </div>
  );
}

/**
 * Get color for block based on its form
 */
function getBlockColor(form: string): string {
  switch (form) {
    case 'hat': return '#CC8800';
    case 'statement': return '#4C97FF';
    case 'c': return '#FFAB19';
    case 'reporter': return '#59C059';
    case 'predicate': return '#5CB1D6';
    default: return '#666666';
  }
}

/**
 * Component for rendering a sequence of blocks
 */
interface SequenceComponentProps {
  blocks: StackBlock[];
  onSequenceChange?: (blocks: StackBlock[]) => void;
  onBlockMove?: (blockId: string) => void;
  registry?: StackRegistry;
  parentBlockId?: string;
  slotKey?: string;
  isNestedInCBlock?: boolean;
}

function SequenceComponent({ blocks, onSequenceChange, onBlockMove, registry, parentBlockId: _parentBlockId, slotKey: _slotKey, isNestedInCBlock = false }: SequenceComponentProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleBlockChange = useCallback((index: number, updatedBlock: StackBlock) => {
    if (!onSequenceChange) return;
    
    const newBlocks = [...blocks];
    newBlocks[index] = updatedBlock;
    onSequenceChange(newBlocks);
  }, [blocks, onSequenceChange]);

  const handleBlockMove = useCallback((blockId: string) => {
    if (!onSequenceChange) return;
    
    // Remove the block from this sequence
    const newBlocks = blocks.filter(block => block.id !== blockId);
    onSequenceChange(newBlocks);
    
    // Notify parent about the move
    if (onBlockMove) {
      onBlockMove(blockId);
    }
  }, [blocks, onSequenceChange, onBlockMove]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling to parent sequences
    
    // Note: During dragover, dataTransfer.getData() may not work in all browsers
    // We'll set a default drop effect and handle the actual data parsing in drop
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
    
    // Calculate drop position based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const blockHeight = 30; // Approximate block height
    const dropIndex = Math.floor(y / blockHeight);
    setDragOverIndex(Math.min(dropIndex, blocks.length));
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set dragOver to false if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling to parent sequences
    setDragOver(false);
    setDragOverIndex(null);

    try {
      const dragDataString = e.dataTransfer.getData('application/json');
      
      if (!dragDataString) {
        console.warn('No drag data found');
        return;
      }
      
      const dragData = JSON.parse(dragDataString);
      
      if (dragData.type === 'palette-block' && dragData.spec && onSequenceChange) {
        // Create a new block from the palette spec
        const newBlock = createBlockFromSpec(dragData.spec);
        const insertIndex = dragOverIndex !== null ? dragOverIndex : blocks.length;
        const newBlocks = [...blocks];
        newBlocks.splice(insertIndex, 0, newBlock);
        onSequenceChange(newBlocks);
        
      } else if (dragData.type === 'existing-block' && dragData.block && onSequenceChange) {
        // Move an existing block to this sequence
        const movedBlock = dragData.block;
        
        // Check if the block is already in this sequence
        const existingIndex = blocks.findIndex(block => block.id === movedBlock.id);
        
        if (existingIndex !== -1) {
          // Moving within the same sequence
          const newBlocks = [...blocks];
          const [removedBlock] = newBlocks.splice(existingIndex, 1);
          let insertIndex = dragOverIndex !== null ? dragOverIndex : blocks.length;
          
          // Adjust insert index if moving within the same sequence
          if (insertIndex > existingIndex) {
            insertIndex--;
          }
          
          newBlocks.splice(insertIndex, 0, removedBlock);
          onSequenceChange(newBlocks);
        } else {
          // Moving from a different sequence
          const insertIndex = dragOverIndex !== null ? dragOverIndex : blocks.length;
          const newBlocks = [...blocks];
          newBlocks.splice(insertIndex, 0, movedBlock);
          onSequenceChange(newBlocks);
          
          // The block will be removed from its original location by the drag source
        }
      }
    } catch (error) {
      console.warn('Failed to parse drag data:', error);
    }
  };

  const sequenceStyle: React.CSSProperties = {
    minHeight: isNestedInCBlock ? '24px' : '40px',
    padding: isNestedInCBlock ? '2px' : '4px',
    borderRadius: isNestedInCBlock ? '2px' : '4px',
    border: dragOver ? '2px dashed #4CAF50' : (isNestedInCBlock ? '1px dashed rgba(255,255,255,0.3)' : '2px dashed transparent'),
    backgroundColor: dragOver ? 'rgba(76, 175, 80, 0.2)' : (isNestedInCBlock ? 'rgba(255,255,255,0.05)' : 'transparent'),
    transition: 'all 0.2s ease',
    position: 'relative'
  };

  const renderDropIndicator = (index: number) => {
    if (!dragOver || dragOverIndex !== index) return null;
    
    return (
      <div
        key={`drop-indicator-${index}`}
        style={{
          height: '2px',
          backgroundColor: '#4CAF50',
          margin: '2px 0',
          borderRadius: '1px',
          animation: 'pulse 1s infinite'
        }}
      />
    );
  };

  return (
    <div 
      style={sequenceStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {renderDropIndicator(0)}
      
      {blocks.map((block, index) => {
        // Get the proper spec from registry if available
        const spec = registry?.get(block.kind) || {
          kind: block.kind,
          label: block.kind, // Fallback label
          form: block.form
        };
        
        return (
          <React.Fragment key={block.id}>
            <div style={{ marginBottom: '2px' }}>
              <BlockComponent 
                block={block} 
                spec={spec}
                registry={registry}
                onBlockChange={(updatedBlock) => handleBlockChange(index, updatedBlock)}
                onBlockMove={handleBlockMove}
                isDraggable={true}
              />
            </div>
            {renderDropIndicator(index + 1)}
          </React.Fragment>
        );
      })}
      
      {blocks.length === 0 && (
        <div style={{ 
          color: isNestedInCBlock ? 'rgba(255,255,255,0.7)' : '#999', 
          fontStyle: 'italic',
          textAlign: 'center',
          padding: isNestedInCBlock ? '4px' : '8px',
          fontSize: isNestedInCBlock ? '10px' : '12px'
        }}>
          {dragOver ? 'Drop block here' : (isNestedInCBlock ? 'Drop blocks here' : 'Drop blocks here or click from palette')}
        </div>
      )}
    </div>
  );
}

/**
 * Component for rendering the block palette
 */
interface PaletteProps {
  registry: StackRegistry;
  onBlockCreate?: (block: StackBlock) => void;
}

/**
 * Component for rendering a draggable palette block
 */
interface PaletteBlockProps {
  spec: StackBlockSpec;
  onDragStart?: (spec: StackBlockSpec) => void;
  onClick?: (spec: StackBlockSpec) => void;
}

function PaletteBlock({ spec, onDragStart, onClick }: PaletteBlockProps): JSX.Element {
  const handleDragStart = (e: React.DragEvent) => {
    // Store the block spec in the drag data
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'palette-block',
      spec: spec
    }));
    e.dataTransfer.effectAllowed = 'copy';
    
    if (onDragStart) {
      onDragStart(spec);
    }
  };

  const handleClick = () => {
    if (onClick) {
      onClick(spec);
    }
  };

  return (
    <div 
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      style={{
        marginBottom: '4px',
        cursor: 'grab'
      }}
      onMouseDown={(e) => {
        // Change cursor to grabbing when mouse is down
        (e.currentTarget as HTMLElement).style.cursor = 'grabbing';
      }}
      onMouseUp={(e) => {
        // Change cursor back to grab when mouse is up
        (e.currentTarget as HTMLElement).style.cursor = 'grab';
      }}
    >
      <BlockComponent 
        block={createBlockFromSpec(spec)} 
        spec={spec}
        isDraggable={false}
      />
    </div>
  );
}

function Palette({ registry, onBlockCreate }: PaletteProps): JSX.Element {
  const allSpecs = registry.getAll();

  const handleBlockClick = (spec: StackBlockSpec) => {
    if (onBlockCreate) {
      const newBlock = createBlockFromSpec(spec);
      onBlockCreate(newBlock);
    }
  };

  const handleDragStart = (spec: StackBlockSpec) => {
    // Optional: Add visual feedback when drag starts
    console.log(`Started dragging block: ${spec.kind}`);
  };

  return (
    <div style={{
      width: '200px',
      backgroundColor: '#f0f0f0',
      padding: '8px',
      borderRight: '1px solid #ccc',
      height: '100%',
      overflowY: 'auto'
    }}>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Blocks</h3>
      <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
        Drag blocks to the editor or click to add
      </div>
      {allSpecs.map(spec => (
        <PaletteBlock
          key={spec.kind}
          spec={spec}
          onDragStart={handleDragStart}
          onClick={handleBlockClick}
        />
      ))}
    </div>
  );
}

/**
 * Main StackEditor component providing visual programming interface
 */
export function StackEditor({ 
  registry, 
  program: initialProgram, 
  onChange, 
  onExecute,
  onSave,
  onLoad
}: StackEditorProps): JSX.Element {
  // Initialize program state
  const [program, setProgram] = useState<StackProgram>(
    initialProgram || { blocks: [] }
  );

  // Update internal state when external program prop changes
  useEffect(() => {
    if (initialProgram) {
      setProgram(initialProgram);
    }
  }, [initialProgram]);

  // Update program and notify parent
  const updateProgram = useCallback((newProgram: StackProgram) => {
    setProgram(newProgram);
    if (onChange) {
      onChange(newProgram);
    }
  }, [onChange]);

  // Handle adding new blocks from palette
  const handleBlockCreate = useCallback((block: StackBlock) => {
    const newProgram = {
      ...program,
      blocks: [...program.blocks, block]
    };
    updateProgram(newProgram);
  }, [program, updateProgram]);

  // Handle changes to the main sequence
  const handleSequenceChange = useCallback((newBlocks: StackBlock[]) => {
    const newProgram = {
      ...program,
      blocks: newBlocks
    };
    updateProgram(newProgram);
  }, [program, updateProgram]);

  // Handle block movement (removal from source)
  const handleBlockMove = useCallback((_blockId: string) => {
    // This is called when a block is moved out of a sequence
    // The block has already been removed from its source sequence
    // We don't need to do anything here for the main sequence
    // as the removal is handled by the sequence component itself
  }, []);

  // Handle execute button click
  const handleExecute = useCallback(() => {
    if (onExecute) {
      onExecute(program);
    }
  }, [program, onExecute]);

  // Handle save button click
  const handleSave = useCallback(() => {
    if (onSave) {
      const serialized = serializeProgram(program);
      onSave(serialized);
    }
  }, [program, onSave]);

  // Handle load button click
  const handleLoad = useCallback(() => {
    if (onLoad) {
      onLoad();
    }
  }, [onLoad]);





  return (
    <div style={{ 
      display: 'flex', 
      height: '500px', 
      border: '1px solid #ccc',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Block Palette */}
      <Palette 
        registry={registry} 
        onBlockCreate={handleBlockCreate}
      />
      
      {/* Main Editor Area */}
      <div style={{ 
        flex: 1, 
        padding: '8px',
        backgroundColor: 'white',
        overflowY: 'auto'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '8px'
        }}>
          <h3 style={{ margin: 0, fontSize: '14px' }}>Program</h3>
          <div style={{ display: 'flex', gap: '4px' }}>
            {onSave && (
              <button 
                onClick={handleSave}
                style={{
                  backgroundColor: '#2196F3',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Save
              </button>
            )}
            {onLoad && (
              <button 
                onClick={handleLoad}
                style={{
                  backgroundColor: '#FF9800',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Load
              </button>
            )}
            {onExecute && (
              <button 
                onClick={handleExecute}
                style={{
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Run
              </button>
            )}
          </div>
        </div>
        
        {/* Main sequence of blocks */}
        <SequenceComponent 
          blocks={program.blocks}
          registry={registry}
          onSequenceChange={handleSequenceChange}
          onBlockMove={handleBlockMove}
        />
        
        {program.blocks.length === 0 && (
          <div style={{ 
            color: '#666', 
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: '20px'
          }}>
            Click blocks from the palette to add them to your program
          </div>
        )}
      </div>
    </div>
  );
}