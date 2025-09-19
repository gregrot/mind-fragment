# Implementation Plan

- [x] 1. Clean up existing codebase and set up minimal structure
  - Delete all existing src/, example/, examples/, and tests/ directories
  - Create new minimal src/ directory structure
  - Update package.json to remove unnecessary dependencies and scripts
  - _Requirements: 8.1, 8.4_

- [x] 2. Implement core type definitions
  - Create src/types.ts with StackForm, InputValue, StackBlockSpec, StackNode, and StackProgram interfaces
  - Add ExecCtx and ExecResult types for execution context
  - Include proper TypeScript generics for type safety
  - _Requirements: 7.1, 7.2_

- [x] 3. Build StackRegistry with default blocks
  - Create src/StackRegistry.ts with block registration and retrieval methods
  - Implement DefaultBlocks array with basic event, control, and looks blocks
  - Add block validation and type checking
  - _Requirements: 5.1, 5.2_

- [x] 4. Create StackInterpreter execution engine
  - Implement src/StackInterpreter.ts with program execution logic
  - Add sequential execution through sequences using array iteration
  - Implement nested sequence execution for C-blocks
  - Add input resolution for reporter blocks and literals
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Build basic StackEditor React component structure
  - Create src/StackEditor.tsx with component props and basic JSX structure
  - Implement program state management and onChange callbacks
  - Add basic rendering of sequences and blocks
  - _Requirements: 1.1, 1.2, 6.2_

- [x] 6. Implement block palette functionality
  - Add block palette rendering in StackEditor component
  - Implement drag start events for palette blocks
  - Create new block instances when dragged from palette
  - _Requirements: 1.3, 2.1_

- [x] 7. Add drag-and-drop for block movement
  - Implement HTML5 drag API for existing blocks in sequences
  - Add drop zone detection and visual feedback
  - Implement array-based movement operations without restrictions
  - Handle drops between different sequences and C-block slots
  - _Requirements: 2.2, 2.3, 3.2, 3.3_

- [x] 8. Implement C-block slot rendering and nesting
  - Add visual rendering for C-shaped blocks with nested sequences
  - Implement drop zones within C-block slots
  - Create new sequences when blocks are dropped into empty slots
  - Add proper visual indentation for nested structures
  - _Requirements: 3.1, 3.4_

- [x] 9. Add program serialization and state management
  - Implement JSON serialization for StackProgram
  - Add program loading and state reconstruction
  - Ensure all program structure and relationships are preserved
  - _Requirements: 6.1, 6.3, 6.4_

- [x] 10. Create main library exports
  - Implement src/index.ts with all public API exports
  - Ensure clean API surface with only essential components
  - Add proper TypeScript type exports
  - _Requirements: 7.3, 8.1_

- [x] 11. Build simple example application
  - Create example/App.tsx demonstrating basic usage
  - Show block palette, drag-drop functionality, and program execution
  - Include example with nested C-blocks and different block types
  - _Requirements: 1.2, 8.2_

- [x] 12. Add minimal execution testing
  - Create tests/execution.test.ts for program execution validation
  - Test sequential execution of statement blocks
  - Test nested C-block execution with proper slot handling
  - Test input resolution for reporter blocks and literals
  - _Requirements: 4.1, 4.2, 4.3_

- [-] 13. Add minimal drag-drop testing
  - Create tests/dragdrop.test.ts for drag-and-drop functionality
  - Test block creation from palette drag operations
  - Test block movement within and between sequences
  - Verify no artificial movement restrictions exist
  - _Requirements: 2.1, 2.2, 2.3_