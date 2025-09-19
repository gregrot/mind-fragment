/**
 * Main React component for the visual stack-based block editor
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { StackRegistry } from './StackRegistry';
import { StackProgram, StackBlock, StackBlockSpec } from './types';
import { serializeProgram } from './StackSerializer';

interface DragContext {
  type: 'palette-block' | 'existing-block';
  spec?: StackBlockSpec;
  blockId?: string;
  block?: StackBlock;
  sourceSequenceId?: string;
}

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

interface RemoveResult {
  blocks: StackBlock[];
  removedBlock?: StackBlock;
}

function removeBlockFromSequence(blocks: StackBlock[], blockId: string): RemoveResult {
  const index = blocks.findIndex(block => block.id === blockId);
  if (index !== -1) {
    const newBlocks = [...blocks];
    const [removedBlock] = newBlocks.splice(index, 1);
    return { blocks: newBlocks, removedBlock };
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block.slots) continue;

    for (const [slotKey, slotBlocks] of Object.entries(block.slots)) {
      const result = removeBlockFromSequence(slotBlocks, blockId);
      if (result.removedBlock) {
        const updatedBlock: StackBlock = {
          ...block,
          slots: {
            ...block.slots,
            [slotKey]: result.blocks,
          },
        };
        const newBlocks = [...blocks];
        newBlocks[i] = updatedBlock;
        return { blocks: newBlocks, removedBlock: result.removedBlock };
      }
    }
  }

  return { blocks };
}

function removeBlockFromProgram(program: StackProgram, blockId: string) {
  const result = removeBlockFromSequence(program.blocks, blockId);
  return {
    program: {
      ...program,
      blocks: result.blocks,
    },
    removedBlock: result.removedBlock,
  };
}

function clampIndex(index: number, length: number) {
  if (index < 0) return 0;
  if (index > length) return length;
  return index;
}

function insertBlockIntoBlock(
  block: StackBlock,
  targetBlockId: string,
  slotKey: string,
  blockToInsert: StackBlock,
  targetIndex: number,
): { updatedBlock: StackBlock; inserted: boolean } {
  if (block.id === targetBlockId) {
    const slots = block.slots ? { ...block.slots } : {};
    const slotBlocks = slots[slotKey] ? [...slots[slotKey]!] : [];
    const insertIndex = clampIndex(targetIndex, slotBlocks.length);
    slotBlocks.splice(insertIndex, 0, blockToInsert);
    return {
      updatedBlock: {
        ...block,
        slots: {
          ...slots,
          [slotKey]: slotBlocks,
        },
      },
      inserted: true,
    };
  }

  if (!block.slots) {
    return { updatedBlock: block, inserted: false };
  }

  let inserted = false;
  const newSlots: Record<string, StackBlock[]> = {};
  for (const [key, slotBlocks] of Object.entries(block.slots)) {
    const updatedSlot: StackBlock[] = [];
    let insertedInThisSlot = false;
    for (const child of slotBlocks) {
      const result = insertBlockIntoBlock(child, targetBlockId, slotKey, blockToInsert, targetIndex);
      if (result.inserted) {
        insertedInThisSlot = true;
      }
      updatedSlot.push(result.updatedBlock);
    }

    if (insertedInThisSlot) {
      inserted = true;
      newSlots[key] = updatedSlot;
    } else {
      newSlots[key] = slotBlocks;
    }
  }

  if (inserted) {
    return {
      updatedBlock: {
        ...block,
        slots: newSlots,
      },
      inserted: true,
    };
  }

  return { updatedBlock: block, inserted: false };
}

function insertBlockIntoProgram(
  program: StackProgram,
  block: StackBlock,
  targetSequenceId: string,
  targetIndex: number,
): StackProgram {
  if (targetSequenceId === 'main') {
    const newBlocks = [...program.blocks];
    const insertIndex = clampIndex(targetIndex, newBlocks.length);
    newBlocks.splice(insertIndex, 0, block);
    return {
      ...program,
      blocks: newBlocks,
    };
  }

  if (!targetSequenceId.startsWith('slot:')) {
    console.warn(`Unknown sequence target: ${targetSequenceId}`);
    return program;
  }

  const [, parentBlockId, slotKey] = targetSequenceId.split(':');
  if (!parentBlockId || !slotKey) {
    console.warn(`Invalid slot sequence identifier: ${targetSequenceId}`);
    return program;
  }

  const newBlocks: StackBlock[] = [];
  let inserted = false;
  for (const blockInProgram of program.blocks) {
    if (inserted) {
      newBlocks.push(blockInProgram);
      continue;
    }

    const result = insertBlockIntoBlock(blockInProgram, parentBlockId, slotKey, block, targetIndex);
    if (result.inserted) {
      inserted = true;
      newBlocks.push(result.updatedBlock);
    } else {
      newBlocks.push(result.updatedBlock);
    }
  }

  if (!inserted) {
    console.warn(`Target slot ${slotKey} on block ${parentBlockId} not found`);
    return program;
  }

  return {
    ...program,
    blocks: newBlocks,
  };
}

function findBlockInSequence(
  blocks: StackBlock[],
  blockId: string,
  sequenceId: string,
): { block: StackBlock; sequenceId: string } | null {
  for (const block of blocks) {
    if (block.id === blockId) {
      return { block, sequenceId };
    }

    if (block.slots) {
      for (const [slotKey, slotBlocks] of Object.entries(block.slots)) {
        const result = findBlockInSequence(slotBlocks, blockId, `slot:${block.id}:${slotKey}`);
        if (result) {
          return result;
        }
      }
    }
  }

  return null;
}

function findBlockInProgram(program: StackProgram, blockId: string) {
  return findBlockInSequence(program.blocks, blockId, 'main');
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
  onDragContextStart?: (info: { block: StackBlock; sequenceId?: string }) => void;
  onDragContextEnd?: () => void;
  sequenceId?: string;
  dragContext?: DragContext | null;
  onExistingBlockDrop?: (request: ExistingBlockDropRequest) => void;
  onNestedBlockDragStart?: (info: { block: StackBlock; sequenceId: string }) => void;
  onNestedDragEnd?: () => void;
}

function BlockComponent({
  block,
  spec,
  onBlockChange,
  onBlockMove,
  registry,
  isDraggable = true,
  onDragContextStart,
  onDragContextEnd,
  sequenceId,
  dragContext,
  onExistingBlockDrop,
  onNestedBlockDragStart,
  onNestedDragEnd,
}: BlockComponentProps): JSX.Element {
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
      block: block,
      sourceSequenceId: sequenceId,
    }));
    e.dataTransfer.effectAllowed = 'move';

    if (onDragContextStart) {
      onDragContextStart({ block, sequenceId });
    }

    // Add visual feedback
    (e.currentTarget as HTMLElement).style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent) => {
    // Reset visual feedback
    (e.currentTarget as HTMLElement).style.opacity = '1';

    if (onDragContextEnd) {
      onDragContextEnd();
    }
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
                  dragContext={dragContext}
                  onExistingBlockDrop={onExistingBlockDrop}
                  onBlockDragStart={onNestedBlockDragStart}
                  onDragEnd={onNestedDragEnd}
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
      data-block-id={block.id}
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
interface ExistingBlockDropRequest {
  blockId: string;
  blockSnapshot?: StackBlock;
  sourceSequenceId?: string;
  targetSequenceId: string;
  targetIndex: number;
}

interface SequenceComponentProps {
  blocks: StackBlock[];
  onSequenceChange?: (blocks: StackBlock[]) => void;
  onBlockMove?: (blockId: string) => void;
  registry?: StackRegistry;
  parentBlockId?: string;
  slotKey?: string;
  isNestedInCBlock?: boolean;
  dragContext?: DragContext | null;
  onExistingBlockDrop?: (request: ExistingBlockDropRequest) => void;
  onBlockDragStart?: (info: { block: StackBlock; sequenceId: string }) => void;
  onDragEnd?: () => void;
}

function SequenceComponent({
  blocks,
  onSequenceChange,
  onBlockMove,
  registry,
  parentBlockId,
  slotKey,
  isNestedInCBlock = false,
  dragContext,
  onExistingBlockDrop,
  onBlockDragStart,
  onDragEnd,
}: SequenceComponentProps): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const sequenceRef = useRef<HTMLDivElement | null>(null);
  const hasPointerPositionRef = useRef(false);

  const sequenceId = isNestedInCBlock
    ? `slot:${parentBlockId ?? 'root'}:${slotKey ?? 'default'}`
    : 'main';

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
    const blockHeight = 30; // Approximate block height

    if (!Number.isFinite(rect.height) || rect.height <= 0) {
      setDragOverIndex(blocks.length);
      hasPointerPositionRef.current = false;
      return;
    }

    const offsetY = e.clientY - rect.top;

    if (!Number.isFinite(offsetY)) {
      setDragOverIndex(blocks.length);
      hasPointerPositionRef.current = false;
      return;
    }

    const dropIndex = Math.floor(offsetY / blockHeight);
    const clampedIndex = Math.max(0, Math.min(dropIndex, blocks.length));
    setDragOverIndex(clampedIndex);
    hasPointerPositionRef.current = true;
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only set dragOver to false if we're actually leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
      setDragOverIndex(null);
    }
  };

  const processDrop = useCallback((event: DragEvent) => {
    const dropEvent = event as DragEvent & { _stackDropHandled?: boolean };
    if (dropEvent._stackDropHandled) {
      return;
    }

    dropEvent._stackDropHandled = true;

    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const currentIndex = dragOverIndex;
    setDragOverIndex(null);

    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    try {
      const dragDataString = dataTransfer.getData('application/json');
      let dragData: DragContext | null = null;

      if (dragDataString) {
        try {
          dragData = JSON.parse(dragDataString);
        } catch (error) {
          console.warn('Failed to parse drag data:', error);
          return;
        }
      } else if (dragContext) {
        dragData = dragContext;
      } else {
        console.warn('No drag data found');
        return;
      }

      if (dragData?.type === 'palette-block' && dragData.spec && onSequenceChange) {
        const hasExplicitIndex = hasPointerPositionRef.current && currentIndex !== null;
        const insertIndex = clampIndex(
          hasExplicitIndex ? currentIndex! : blocks.length,
          blocks.length,
        );
        const newBlocks = [...blocks];
        newBlocks.splice(insertIndex, 0, createBlockFromSpec(dragData.spec));
        onSequenceChange(newBlocks);
      } else if (dragData?.type === 'existing-block') {
        const blockId = dragData.blockId ?? dragData.block?.id;
        if (!blockId) {
          console.warn('Missing block identifier for existing block drag');
          return;
        }

        const hasExplicitIndex = hasPointerPositionRef.current && currentIndex !== null;
        const insertIndex = clampIndex(
          hasExplicitIndex ? currentIndex! : blocks.length,
          blocks.length,
        );
        const existingIndex = blocks.findIndex(block => block.id === blockId);

        if (existingIndex !== -1 && onSequenceChange) {
          const newBlocks = [...blocks];
          const [removedBlock] = newBlocks.splice(existingIndex, 1);
          let targetIndex = insertIndex;
          if (targetIndex > existingIndex) {
            targetIndex--;
          }
          newBlocks.splice(targetIndex, 0, removedBlock);
          onSequenceChange(newBlocks);
        } else if (onExistingBlockDrop) {
          onExistingBlockDrop({
            blockId,
            blockSnapshot: dragData.block ?? dragContext?.block,
            sourceSequenceId: dragData.sourceSequenceId ?? dragContext?.sourceSequenceId,
            targetSequenceId: sequenceId,
            targetIndex: insertIndex,
          });
        }
      }
    } finally {
      hasPointerPositionRef.current = false;
      if (onDragEnd) {
        onDragEnd();
      }
    }
  }, [blocks, dragContext, dragOverIndex, onDragEnd, onExistingBlockDrop, onSequenceChange, sequenceId]);

  const handleDrop = (e: React.DragEvent) => {
    processDrop(e.nativeEvent);
  };

  useEffect(() => {
    const node = sequenceRef.current;
    if (!node) return;

    const listener = (event: DragEvent) => {
      processDrop(event);
    };

    node.addEventListener('drop', listener);
    return () => {
      node.removeEventListener('drop', listener);
    };
  }, [processDrop]);

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
      data-sequence-id={sequenceId}
      style={sequenceStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      ref={sequenceRef}
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
                sequenceId={sequenceId}
                onDragContextStart={
                  onBlockDragStart
                    ? (info) => onBlockDragStart({ block: info.block, sequenceId })
                    : undefined
                }
                onDragContextEnd={onDragEnd}
                dragContext={dragContext}
                onExistingBlockDrop={onExistingBlockDrop}
                onNestedBlockDragStart={onBlockDragStart}
                onNestedDragEnd={onDragEnd}
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
  onBlockDragStart?: (spec: StackBlockSpec) => void;
  onBlockDragEnd?: () => void;
}

/**
 * Component for rendering a draggable palette block
 */
interface PaletteBlockProps {
  spec: StackBlockSpec;
  onDragStart?: (spec: StackBlockSpec) => void;
  onClick?: (spec: StackBlockSpec) => void;
  onDragContextStart?: (spec: StackBlockSpec) => void;
  onDragContextEnd?: () => void;
}

function PaletteBlock({ spec, onDragStart, onClick, onDragContextStart, onDragContextEnd }: PaletteBlockProps): JSX.Element {
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

    if (onDragContextStart) {
      onDragContextStart(spec);
    }
  };

  const handleDragEnd = () => {
    if (onDragContextEnd) {
      onDragContextEnd();
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
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      style={{
        marginBottom: '4px',
        cursor: 'grab'
      }}
      data-palette-kind={spec.kind}
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

function Palette({ registry, onBlockCreate, onBlockDragStart, onBlockDragEnd }: PaletteProps): JSX.Element {
  const allSpecs = registry.getAll();

  const handleBlockClick = (spec: StackBlockSpec) => {
    if (onBlockCreate) {
      const newBlock = createBlockFromSpec(spec);
      onBlockCreate(newBlock);
    }
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
          onClick={handleBlockClick}
          onDragContextStart={onBlockDragStart}
          onDragContextEnd={onBlockDragEnd}
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
  const [dragContext, setDragContext] = useState<DragContext | null>(null);

  // Update internal state when external program prop changes
  useEffect(() => {
    if (initialProgram) {
      setProgram(initialProgram);
    }
  }, [initialProgram]);

  useEffect(() => {
    const handleNativeDragStart = (event: DragEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const blockElement = target.closest<HTMLElement>('[data-block-id]');
      if (blockElement) {
        const blockId = blockElement.getAttribute('data-block-id');
        if (!blockId) return;
        const found = findBlockInProgram(program, blockId);
        if (found) {
          setDragContext({
            type: 'existing-block',
            blockId,
            block: found.block,
            sourceSequenceId: found.sequenceId,
          });
        }
        return;
      }

      const paletteElement = target.closest<HTMLElement>('[data-palette-kind]');
      if (paletteElement) {
        const kind = paletteElement.getAttribute('data-palette-kind');
        if (!kind) return;
        const spec = registry.get(kind);
        if (spec) {
          setDragContext({
            type: 'palette-block',
            spec,
          });
        }
      }
    };

    const handleNativeDragEnd = () => {
      setDragContext(null);
    };

    window.addEventListener('dragstart', handleNativeDragStart, true);
    window.addEventListener('dragend', handleNativeDragEnd, true);

    return () => {
      window.removeEventListener('dragstart', handleNativeDragStart, true);
      window.removeEventListener('dragend', handleNativeDragEnd, true);
    };
  }, [program, registry]);

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

  const handleExistingBlockDrop = useCallback((request: ExistingBlockDropRequest) => {
    const { program: programWithoutBlock, removedBlock } = removeBlockFromProgram(program, request.blockId);
    const blockToInsert = removedBlock ?? request.blockSnapshot;

    if (!blockToInsert) {
      console.warn(`Block ${request.blockId} not found for move operation`);
      return;
    }

    const updatedProgram = insertBlockIntoProgram(
      programWithoutBlock,
      blockToInsert,
      request.targetSequenceId,
      request.targetIndex,
    );

    updateProgram(updatedProgram);
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

  const handleBlockDragStart = useCallback((info: { block: StackBlock; sequenceId: string }) => {
    setDragContext({
      type: 'existing-block',
      blockId: info.block.id,
      block: info.block,
      sourceSequenceId: info.sequenceId,
    });
  }, []);

  const handlePaletteDragStart = useCallback((spec: StackBlockSpec) => {
    setDragContext({
      type: 'palette-block',
      spec,
    });
  }, []);

  const clearDragContext = useCallback(() => {
    setDragContext(null);
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
        onBlockDragStart={handlePaletteDragStart}
        onBlockDragEnd={clearDragContext}
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
          dragContext={dragContext}
          onExistingBlockDrop={handleExistingBlockDrop}
          onBlockDragStart={handleBlockDragStart}
          onDragEnd={clearDragContext}
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