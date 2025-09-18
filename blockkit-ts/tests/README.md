# BlockKit TS Testing Suite

This directory contains the comprehensive testing suite for the BlockKit TS library.

## Test Structure

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
    ├── test-utils.ts        # Custom render and testing utilities
    ├── mock-data.ts         # Mock data factories
    └── setup.ts             # Global test setup
```

## Available Scripts

- `npm run test` - Run all tests once
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:coverage:watch` - Run tests with coverage in watch mode

## Testing Framework

- **Vitest**: Primary testing framework with TypeScript support
- **React Testing Library**: Component testing with user-centric approach
- **jsdom**: DOM environment simulation
- **@testing-library/jest-dom**: Enhanced DOM matchers

## Test Utilities

### Mock Data Factories

Use the mock data factories in `utils/mock-data.ts` to create test data:

```typescript
import { createMockGraph, createMockStackProgram } from '../utils/mock-data';

// Create a simple graph with 2 nodes and 1 link
const graph = createMockGraph({ nodeCount: 2, linkCount: 1 });

// Create a complex stack program
const program = createMockStackProgram({ complexity: 'complex' });
```

### Custom Render

Use the custom render function for React components:

```typescript
import { render, screen } from '../utils/test-utils';

test('should render component', () => {
  render(<MyComponent />);
  expect(screen.getByRole('button')).toBeInTheDocument();
});
```

## Coverage Targets

- Unit tests: 95%+ coverage for core modules
- Integration tests: 90%+ coverage for workflows  
- Component tests: 85%+ coverage for UI components
- Overall project: 90%+ coverage

## Writing Tests

### Unit Tests
Focus on testing individual functions and classes in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../../src/BlockRegistry';

describe('BlockRegistry', () => {
  it('should register a block', () => {
    const registry = new BlockRegistry();
    const block = { kind: 'test', name: 'Test Block' };
    
    registry.register(block);
    
    expect(registry.get('test')).toBe(block);
  });
});
```

### Integration Tests
Test complete workflows and component interactions:

```typescript
import { describe, it, expect } from 'vitest';

describe('Graph Workflow', () => {
  it('should create, connect, and execute a graph', async () => {
    // Test complete workflow
  });
});
```

### Component Tests
Test React components with user interactions:

```typescript
import { render, screen, userEvent } from '../utils/test-utils';

test('should handle user interaction', async () => {
  const user = userEvent.setup();
  render(<BlockEditor />);
  
  await user.click(screen.getByRole('button'));
  
  expect(screen.getByText('Expected result')).toBeInTheDocument();
});
```