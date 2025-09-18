# Design Document

## Overview

The BlockKit TS testing suite will provide comprehensive test coverage for both the graph-based and scratch-style block programming editors. The design leverages Vitest as the primary testing framework due to its excellent TypeScript support, fast execution, and seamless integration with Vite (which the project already uses). React Testing Library will handle component testing to ensure UI components behave correctly from a user perspective.

The testing architecture follows a layered approach:
- **Unit Tests**: Individual modules and functions in isolation
- **Integration Tests**: Component interactions and complete workflows  
- **Component Tests**: React component rendering and behavior
- **Example Tests**: Validation of demo applications
- **Performance Tests**: Edge cases and scalability scenarios

## Architecture

### Testing Framework Stack

**Primary Framework: Vitest**
- Fast execution with native TypeScript support
- Built-in mocking and assertion capabilities
- Excellent coverage reporting
- Seamless integration with existing Vite configuration

**Component Testing: React Testing Library**
- User-centric testing approach
- DOM-based assertions rather than implementation details
- Excellent accessibility testing support
- Integrates well with Vitest

**Additional Tools:**
- `@testing-library/jest-dom` for enhanced DOM matchers
- `@testing-library/user-event` for realistic user interactions
- `jsdom` for DOM environment simulation

### Test Organization Structure

```
tests/
├── unit/                    # Unit tests for individual modules
│   ├── BlockRegistry.test.ts
│   ├── Graph.test.ts
│   ├── Interpreter.test.ts
│   ├── DefaultBlocks.test.ts
│   └── scratch/
│       ├── StackRegistry.test.ts
│       ├── StackInterpreter.test.ts
│       └── DefaultStackBlocks.test.ts
├── integration/             # Integration and workflow tests
│   ├── graph-workflow.test.ts
│   ├── stack-workflow.test.ts
│   └── serialization.test.ts
├── components/              # React component tests
│   ├── BlockEditor.test.tsx
│   └── StackEditor.test.tsx
├── examples/                # Example application tests
│   ├── App.test.tsx
│   └── StackApp.test.tsx
├── performance/             # Performance and edge case tests
│   ├── large-graphs.test.ts
│   └── memory-usage.test.ts
└── utils/                   # Test utilities and helpers
    ├── test-utils.ts
    ├── mock-data.ts
    └── setup.ts
```

## Components and Interfaces

### Test Configuration

**Vitest Configuration (`vitest.config.ts`)**
```typescript
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/utils/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/']
    }
  }
});
```

**Test Setup (`tests/utils/setup.ts`)**
- Configure jsdom environment
- Set up React Testing Library
- Initialize global test utilities
- Configure mock implementations

### Unit Test Modules

**BlockRegistry Tests**
- Registration validation (duplicate prevention, spec validation)
- Retrieval operations (get, all methods)
- Type compatibility checking with various type combinations
- Error handling for invalid registrations

**Graph State Tests**
- Node operations (add, move, update, remove)
- Link operations (add, remove, validation)
- Serialization and deserialization
- State consistency and immutability
- Zustand store behavior

**Interpreter Tests**
- Topological sorting algorithm
- Execution order validation
- Input resolution from connected nodes
- Error handling for cycles and missing blocks
- Async execution support

**DefaultBlocks Tests**
- Each block's evaluation logic
- Input/output type handling
- Configuration schema validation
- Edge cases (null, undefined, type coercion)

### Integration Test Workflows

**Complete Graph Workflow**
```typescript
describe('Graph Workflow Integration', () => {
  test('should create, connect, and execute a complete graph', async () => {
    // 1. Create registry with blocks
    // 2. Build graph with nodes and connections
    // 3. Execute graph and validate results
    // 4. Test serialization roundtrip
  });
});
```

**Complete Stack Workflow**
```typescript
describe('Stack Workflow Integration', () => {
  test('should build and execute a scratch-style program', async () => {
    // 1. Create stack registry
    // 2. Build program with different block types
    // 3. Execute program and validate behavior
    // 4. Test program serialization
  });
});
```

### Component Test Strategy

**BlockEditor Component Tests**
- Rendering with different registry configurations
- Canvas interaction simulation
- Node creation and connection behavior
- Toolbar functionality
- Error boundary behavior

**StackEditor Component Tests**
- Program state management
- Block palette interactions
- Drag and drop simulation
- Program modification callbacks
- Visual feedback validation

### Mock and Test Data Strategy

**Mock Data Factory**
```typescript
export const createMockGraph = (options?: Partial<GraphData>): GraphData => {
  // Generate realistic test graphs
};

export const createMockStackProgram = (complexity: 'simple' | 'complex'): StackProgram => {
  // Generate test programs with various structures
};
```

**Component Mocking**
- Mock Zustand stores for isolated component testing
- Mock registry implementations for controlled testing
- Mock DOM APIs for canvas interactions

## Data Models

### Test Data Structures

**Test Graph Scenarios**
- Empty graphs
- Simple linear chains
- Complex branching structures
- Graphs with cycles (for error testing)
- Large graphs (performance testing)

**Test Stack Program Scenarios**
- Single hat block programs
- Nested C-block structures
- Reporter and predicate combinations
- Complex control flow patterns

**Test Configuration Objects**
- Valid block configurations
- Invalid configurations (schema validation)
- Edge case configurations (empty, null values)

### Coverage Targets

**Code Coverage Goals**
- Unit tests: 95%+ coverage for core modules
- Integration tests: 90%+ coverage for workflows
- Component tests: 85%+ coverage for UI components
- Overall project: 90%+ coverage

**Functional Coverage**
- All block types and their variations
- All graph operations and edge cases
- All stack program structures
- Error scenarios and recovery paths

## Error Handling

### Test Error Scenarios

**Graph Errors**
- Circular dependency detection
- Missing block specifications
- Invalid node configurations
- Malformed link structures

**Stack Errors**
- Invalid program structures
- Missing slot connections
- Type mismatches in inputs
- Execution failures in blocks

**Component Errors**
- Invalid props handling
- State corruption recovery
- Rendering error boundaries
- Event handler failures

### Error Testing Strategy

```typescript
describe('Error Handling', () => {
  test('should handle circular dependencies gracefully', () => {
    expect(() => interpreter.run(circularGraph)).toThrow('Graph contains a cycle');
  });
  
  test('should validate block configurations', () => {
    expect(() => registry.register(invalidBlock)).toThrow('Invalid block specification');
  });
});
```

## Testing Strategy

### Test Execution Phases

**Phase 1: Unit Tests**
- Fast-running isolated tests
- Run on every code change
- Immediate feedback for developers
- Foundation for all other testing

**Phase 2: Integration Tests**
- Validate component interactions
- Test complete user workflows
- Ensure data flow correctness
- Run before commits

**Phase 3: Component Tests**
- UI behavior validation
- User interaction simulation
- Accessibility compliance
- Visual regression prevention

**Phase 4: Performance Tests**
- Large dataset handling
- Memory usage validation
- Execution time benchmarks
- Scalability verification

### Test Maintenance Strategy

**Test Data Management**
- Centralized test data factories
- Realistic but deterministic data
- Easy updates for schema changes
- Version-controlled test fixtures

**Test Utility Evolution**
- Reusable test helpers
- Custom matchers for domain concepts
- Shared setup and teardown logic
- Mock management utilities