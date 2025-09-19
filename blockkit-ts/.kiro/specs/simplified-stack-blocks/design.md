# Design Document

## Overview

The simplified stack blocks library will be a minimal React + TypeScript implementation focused exclusively on Scratch-style visual programming. The design prioritizes simplicity, with the fewest possible files and a clean list-based data structure that eliminates movement restrictions.

## Architecture

### Core Philosophy
- **Minimal File Count**: Keep the entire implementation in 4-5 core files
- **List-Based Structure**: Use arrays for sequences instead of linked lists to eliminate movement restrictions
- **React-First**: Built specifically for React applications with TypeScript support
- **Zero Legacy**: Clean implementation without backwards compatibility concerns

### File Structure
```
src/
├── index.ts           # Main exports
├── types.ts           # Core type definitions
├── StackEditor.tsx    # Main React component
├── StackRegistry.ts   # Block definitions and registry
└── StackInterpreter.ts # Program execution engine

example/
└── App.tsx           # Simple demo application
```

## Components and Interfaces

### Core Types (`types.ts`)

```typescript
export type StackForm = "hat" | "statement" | "c" | "reporter" | "predicate";

export type InputValue = { literal: unknown } | { blockId: string };

export interface StackBlockSpec<C = any> {
  kind: string;
  label: string;
  form: StackForm;
  inputs?: { key: string; type?: "number"|"string"|"boolean"|"any" }[];
  slots?: { key: string; label?: string }[];
  execute?: (ctx: ExecCtx<C>) => Promise<ExecResult> | ExecResult;
}



export interface StackProgram {
  blocks: StackBlock[];  // Simple list of top-level blocks
}

export interface StackBlock<C = any> {
  id: string;
  kind: string;
  form: StackForm;
  inputs?: Record<string, InputValue>;
  slots?: Record<string, StackBlock[]>;  // slotKey -> child blocks
  config?: C;
}
```

### StackRegistry (`StackRegistry.ts`)

Simple registry for block definitions with built-in default blocks:

```typescript
export class StackRegistry {
  private blocks = new Map<string, StackBlockSpec>();
  
  register(spec: StackBlockSpec): void
  get(kind: string): StackBlockSpec | undefined
  getAll(): StackBlockSpec[]
}

// Default blocks: event.start, control.repeat, control.wait, looks.say
export const DefaultBlocks: StackBlockSpec[];
```

### StackEditor (`StackEditor.tsx`)

Main React component with drag-and-drop functionality:

```typescript
interface StackEditorProps {
  registry: StackRegistry;
  program?: StackProgram;
  onChange?: (program: StackProgram) => void;
  onExecute?: (program: StackProgram) => void;
}

export function StackEditor(props: StackEditorProps): JSX.Element
```

**Key Features:**
- Block palette on the left
- Main editor area with sequences
- Drag-and-drop using HTML5 drag API
- Visual feedback for drop zones
- Simple array-based movement operations

### StackInterpreter (`StackInterpreter.ts`)

Execution engine for running programs:

```typescript
export class StackInterpreter {
  async run(program: StackProgram): Promise<void>
  private async executeBlocks(blocks: StackBlock[]): Promise<void>
  private async executeBlock(block: StackBlock): Promise<unknown>
}
```

## Data Models

### Program Structure

The core data model uses a simple tree-based approach where programs are just lists of blocks, and each block can contain child blocks in its slots:

```typescript
// Example program structure
const program: StackProgram = {
  blocks: [
    {
      id: "start1", 
      kind: "event.start", 
      form: "hat"
    },
    {
      id: "say1", 
      kind: "looks.say", 
      form: "statement", 
      inputs: { TEXT: { literal: "Hello!" } }
    },
    {
      id: "repeat1", 
      kind: "control.repeat", 
      form: "c", 
      inputs: { TIMES: { literal: 3 } },
      slots: {
        DO: [
          {
            id: "wait1", 
            kind: "control.wait", 
            form: "statement", 
            inputs: { DURATION: { literal: 1 } }
          }
        ]
      }
    }
  ]
};
```

### Movement Operations

All movement operations are simple array manipulations on the block lists:

```typescript
// Move within the same list: splice and insert
const moveInList = (blocks: StackBlock[], from: number, to: number) => {
  const [item] = blocks.splice(from, 1);
  blocks.splice(to, 0, item);
};

// Move between different lists (e.g., main program to slot): remove from one, add to another
const moveBetweenLists = (fromList: StackBlock[], toList: StackBlock[], block: StackBlock, toIndex: number) => {
  const fromIndex = fromList.findIndex(b => b.id === block.id);
  fromList.splice(fromIndex, 1);
  toList.splice(toIndex, 0, block);
};

// Move to slot: add block to a slot's block list
const moveToSlot = (block: StackBlock, targetBlock: StackBlock, slotKey: string, index: number) => {
  if (!targetBlock.slots) targetBlock.slots = {};
  if (!targetBlock.slots[slotKey]) targetBlock.slots[slotKey] = [];
  targetBlock.slots[slotKey].splice(index, 0, block);
};
```

## Error Handling

### Execution Errors
- Graceful handling of missing blocks or invalid configurations
- Console logging for debugging
- Continue execution when possible, skip problematic blocks

### Drag-and-Drop Errors
- Visual feedback for invalid drop targets
- Prevent dropping incompatible block types
- Maintain program integrity during operations

### Type Safety
- Full TypeScript coverage for compile-time error prevention
- Runtime validation for critical operations
- Clear error messages for development

## Testing Strategy

### Minimal Testing Scope
Focus only on the two most critical areas:

1. **Execution Testing** (`tests/execution.test.ts`)
   - Verify programs execute in correct sequence order
   - Test nested C-block execution
   - Validate input resolution and block communication

2. **Drag-Drop Testing** (`tests/dragdrop.test.ts`)
   - Test block creation from palette
   - Verify movement operations update program structure correctly
   - Ensure no artificial movement restrictions

### Testing Approach
- Use Vitest for simple, fast testing
- React Testing Library for component interactions
- Mock DOM drag events for drag-drop testing
- Focus on behavior, not implementation details

### Test Structure
```typescript
// Example execution test
it('should execute nested repeat blocks correctly', async () => {
  const program = createTestProgram();
  const interpreter = new StackInterpreter();
  const result = await interpreter.run(program);
  expect(executionLog).toEqual(['start', 'say hello', 'wait', 'wait', 'wait']);
});

// Example drag-drop test
it('should move blocks between lists without restrictions', () => {
  const { getByTestId } = render(<StackEditor registry={registry} />);
  const block = getByTestId('block-say1');
  const dropZone = getByTestId('slot-repeat-do');
  
  fireEvent.dragStart(block);
  fireEvent.drop(dropZone);
  
  expect(program.blocks[2].slots?.DO).toContainEqual(expect.objectContaining({ id: 'say1' }));
});
```

## Implementation Priorities

### Phase 1: Core Structure
1. Define types and interfaces
2. Implement StackRegistry with default blocks
3. Create basic StackProgram utilities

### Phase 2: Visual Editor
1. Build StackEditor component with basic rendering
2. Implement block palette
3. Add drag-and-drop functionality

### Phase 3: Execution Engine
1. Implement StackInterpreter
2. Add execution context and block communication
3. Handle nested sequences and C-blocks

### Phase 4: Polish
1. Add visual feedback and styling
2. Implement basic tests
3. Create example application

## Design Decisions

### Why Simple Tree Structure?
- **Eliminates Movement Restrictions**: Arrays allow any block to move to any position
- **Intuitive Mental Model**: Visual nesting matches data structure nesting
- **Simpler Implementation**: No complex ID lookups or sequence management
- **Better Performance**: Direct access to child blocks without indirection
- **Natural Recursion**: Tree structure naturally supports nested execution

### Why Minimal File Count?
- **Easier Maintenance**: Fewer files to track and update
- **Faster Development**: Less context switching between files
- **Clearer Architecture**: Related functionality stays together
- **Simpler Debugging**: Easier to trace issues across fewer files

### Why React-First?
- **Modern Standard**: React is the dominant UI library
- **TypeScript Integration**: Excellent TypeScript support
- **Component Model**: Natural fit for block-based UI
- **Ecosystem**: Rich ecosystem of tools and libraries

### Why No Legacy Support?
- **Clean Implementation**: No technical debt from old decisions
- **Simpler Code**: No migration logic or compatibility layers
- **Better Performance**: Optimized for current use cases only
- **Faster Development**: No need to test multiple code paths