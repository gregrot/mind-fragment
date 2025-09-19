# Implementation Plan

- [x] 1. Set up testing infrastructure and configuration
  - Install and configure Vitest with TypeScript support
  - Set up React Testing Library and jsdom environment
  - Create test configuration files and setup utilities
  - Configure coverage reporting and test scripts
  - _Requirements: 6.1, 6.2, 6.4_

- [x] 2. Create test utilities and mock data factories
  - [x] 2.1 Implement core test utilities and setup
    - Create test setup file with jsdom configuration
    - Implement mock data factories for graphs and stack programs
    - Create helper functions for test assertions and common operations
    - _Requirements: 6.3_

  - [x] 2.2 Create component testing utilities
    - Set up React Testing Library custom render function
    - Create mock implementations for Zustand stores
    - Implement utilities for simulating user interactions
    - _Requirements: 6.3_

- [x] 3. Implement unit tests for core graph components
  - [x] 3.1 Create BlockRegistry unit tests
    - Test block registration with valid and invalid specs
    - Test block retrieval and registry enumeration
    - Test type compatibility checking with various type combinations
    - Test error handling for duplicate registrations
    - _Requirements: 1.1_

  - [x] 3.2 Create Graph state management unit tests
    - Test node operations (add, move, update, remove)
    - Test link operations (add, remove, duplicate prevention)
    - Test graph serialization and deserialization
    - Test state consistency and Zustand store behavior
    - _Requirements: 1.2_

  - [x] 3.3 Create Interpreter unit tests
    - Test topological sorting algorithm with various graph structures
    - Test execution order validation and input resolution
    - Test error handling for cycles and missing blocks
    - Test async execution support and result collection
    - _Requirements: 1.3_

  - [x] 3.4 Create DefaultBlocks unit tests
    - Test each block's evaluation logic and edge cases
    - Test input/output type handling and coercion
    - Test configuration schema validation
    - Test error handling for invalid inputs
    - _Requirements: 1.4_

- [x] 4. Implement unit tests for scratch components
  - [x] 4.1 Create StackRegistry unit tests
    - Test stack block registration and retrieval
    - Test error handling for duplicate kinds
    - Test registry enumeration and validation
    - _Requirements: 1.5_

  - [x] 4.2 Create StackInterpreter unit tests
    - Test execution of different block forms (hat, statement, c, reporter, predicate)
    - Test slot handling and nested execution
    - Test input resolution for literals and nested blocks
    - Test error handling and execution context management
    - _Requirements: 1.6_

  - [x] 4.3 Create DefaultStackBlocks unit tests
    - Test each stack block's execution logic
    - Test different block forms and their behaviors
    - Test configuration handling and validation
    - Test error scenarios and edge cases
    - _Requirements: 1.6_

- [x] 5. Implement integration tests for complete workflows
  - [x] 5.1 Create graph workflow integration tests
    - Test complete graph creation, connection, and execution workflow
    - Test serialization roundtrip with complex graphs
    - Test error scenarios with invalid graphs and missing blocks
    - Test performance with moderately complex graphs
    - _Requirements: 2.1, 2.4_

  - [x] 5.2 Create stack workflow integration tests
    - Test complete stack program building and execution
    - Test different program structures and control flows
    - Test serialization and deserialization of stack programs
    - Test error handling in complex program scenarios
    - _Requirements: 2.2, 2.4_

  - [x] 5.3 Create serialization integration tests
    - Test schema validation for both graph and stack data structures
    - Test data integrity across serialization boundaries
    - Test backward compatibility and version handling
    - Test error recovery from corrupted data
    - _Requirements: 2.3, 2.5_

- [x] 6. Implement React component tests
  - [x] 6.1 Create BlockEditor component tests
    - Test component rendering with different registry configurations
    - Test basic interaction simulation and event handling
    - Test prop validation and error boundary behavior
    - Test component state management and updates
    - _Requirements: 3.1, 3.3, 3.4_

  - [x] 6.2 Create StackEditor component tests
    - Test component rendering with registry and program state
    - Test program modification callbacks and state updates
    - Test prop handling and component lifecycle
    - Test error scenarios and graceful degradation
    - _Requirements: 3.2, 3.3, 3.4_

  - [x] 6.3 Create drag-and-drop behavior tests
    - Test block movement within control structures using the provided program JSON
    - Test the specific scenario: moving first "say hello" after "wait 1 second" triggers proper restriction
    - Test that movement restrictions are consistently enforced in stack editor
    - Test complex nested drag-and-drop scenarios
    - Test edge cases and invalid drop targets
    - _Requirements: 3.6, 3.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 7. Implement example application tests
  - [x] 7.1 Create main App example tests
    - Test dual editor mode rendering and switching
    - Test toolbar functionality and graph operations
    - Test example interaction flows and user scenarios
    - Test error handling and user feedback
    - _Requirements: 4.1, 4.3, 4.4_

  - [x] 7.2 Create StackApp example tests
    - Test program building, execution, and export functionality
    - Test user interface interactions and state management
    - Test example program execution and output validation
    - Test error scenarios and recovery mechanisms
    - _Requirements: 4.2, 4.3, 4.5_

- [x] 8. Implement performance and edge case tests
  - [x] 8.1 Create large graph performance tests
    - Test performance with graphs containing many nodes and connections
    - Test memory usage patterns and cleanup
    - Test execution time benchmarks for complex graphs
    - Test scalability limits and graceful degradation
    - _Requirements: 5.1, 5.4_

  - [x] 8.2 Create complex structure tests
    - Test deeply nested C-blocks and reporter chains
    - Test edge cases with empty graphs and malformed data
    - Test circular dependency detection and error handling
    - Test concurrent operations and state consistency
    - _Requirements: 5.2, 5.3, 5.5_



- [x] 9. Finalize testing documentation and integration
  - Create comprehensive testing documentation
  - Update package.json with all test scripts
  - Validate complete test coverage meets requirements
  - Create developer guide for running and maintaining tests
  - _Requirements: 7.2, 7.4_