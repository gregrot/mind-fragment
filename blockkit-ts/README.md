# BlockKit TS – React + TypeScript visual blocks starter

This is a minimal but production‑ready **starter package** for building a drag‑and‑drop, block‑based programming editor that host apps can embed. It gives you:

- A clean **Block Registry API** to define a DSL and blocks.
- A simple **graph model** (nodes + ports + links) with serialization.
- A **canvas editor** with drag‑drop from a palette and click‑to‑connect wiring.
- A pluggable **interpreter** (default provided) that runs graphs by topological order.
- Strong types and **schema validation**.

It's intentionally compact so you can extend it with your own styling, persistence, and execution backends.

## Getting Started

1. Install dependencies: `npm install`
2. Run the example: `npm run dev`
3. Build the library: `npm run build`

## Usage

```tsx
import { BlockEditor, BlockRegistry, DefaultBlocks } from "blockkit-ts";

const registry = new BlockRegistry();
DefaultBlocks.forEach(b => registry.register(b));

function App() {
  return <BlockEditor registry={registry} height={560} />;
}
```

See `example/App.tsx` for a complete working example.

## Testing

BlockKit includes comprehensive testing infrastructure:

```bash
# Run all tests
npm test

# Run tests in watch mode (recommended for development)
npm run test:watch

# Run with coverage
npm run test:coverage

# Validate coverage thresholds
npm run test:validate
```

### Test Categories
- **Unit Tests**: Core functionality and utilities
- **Component Tests**: React components with user interactions
- **Integration Tests**: Complete workflows and cross-component behavior
- **Performance Tests**: Scalability and performance benchmarks

### Key Features Tested
- ✅ **Movement Freedom**: New list-based structure eliminates artificial restrictions
- ✅ **Drag & Drop**: Comprehensive visual editor interaction testing
- ✅ **Legacy Compatibility**: Automatic migration from old data formats
- ✅ **Performance**: Scalability testing with large programs
- ✅ **Error Handling**: Graceful failure and recovery scenarios

For detailed testing information, see:
- [Testing Overview](docs/TESTING_OVERVIEW.md)
- [Developer Testing Guide](docs/DEVELOPER_TESTING_GUIDE.md)
- [Complete Testing Documentation](TESTING.md)