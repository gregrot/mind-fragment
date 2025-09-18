import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { create } from 'zustand';
import type { GraphState } from '../../src/Graph';
import type { BlockRegistry } from '../../src/BlockRegistry';
import { StackRegistry } from '../../src/scratch/StackRegistry';
import type { StackProgram } from '../../src/scratch/stackTypes';
import { 
  createMockBlockSpec, 
  createMockStackBlockSpec, 
  createTestBlockSpecs, 
  createTestStackBlockSpecs,
  createMockGraph,
  createMockStackProgram
} from './mock-data';

// Mock Zustand store for Graph testing
export const createMockGraphStore = (initialState?: Partial<GraphState>) => {
  const defaultState: GraphState = {
    nodes: [],
    links: [],
    addNode: vi.fn((node) => {
      const id = node.id || 'mock-id';
      return id;
    }),
    moveNode: vi.fn(),
    updateNode: vi.fn(),
    removeNode: vi.fn(),
    addLink: vi.fn(() => 'mock-link-id'),
    removeLink: vi.fn(),
    load: vi.fn(),
    ...initialState
  };

  return create<GraphState>(() => defaultState);
};

// Mock BlockRegistry for testing
export const createMockBlockRegistry = (specs = createTestBlockSpecs()): BlockRegistry => {
  const registry = {
    register: vi.fn(),
    get: vi.fn((kind: string) => specs.find(s => s.kind === kind)),
    all: vi.fn(() => specs),
  } as unknown as BlockRegistry;

  return registry;
};

// Mock StackRegistry for testing
export const createMockStackRegistry = (specs = createTestStackBlockSpecs()): StackRegistry => {
  const registry = new StackRegistry();
  
  // Register all test specs
  specs.forEach(spec => {
    registry.register(spec);
  });

  return registry;
};

// Component wrapper providers
interface TestProvidersProps {
  children: React.ReactNode;
  graphStore?: ReturnType<typeof createMockGraphStore>;
}

export const TestProviders: React.FC<TestProvidersProps> = ({ 
  children, 
  graphStore 
}) => {
  // If a custom graph store is provided, we could use a context provider here
  // For now, we'll just render children directly since the components use the global store
  return <>{children}</>;
};

// Custom render function for components
export const renderWithProviders = (
  ui: React.ReactElement,
  options?: {
    renderOptions?: Omit<RenderOptions, 'wrapper'>;
    graphStore?: ReturnType<typeof createMockGraphStore>;
  }
) => {
  const { renderOptions, graphStore } = options || {};
  
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <TestProviders graphStore={graphStore}>
      {children}
    </TestProviders>
  );

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

// BlockEditor testing utilities
export interface BlockEditorTestProps {
  registry?: BlockRegistry;
  height?: number;
}

export const renderBlockEditor = (props: BlockEditorTestProps = {}) => {
  const { BlockEditor } = require('../../src/BlockEditor');
  
  const defaultProps = {
    registry: createMockBlockRegistry(),
    height: 480,
    ...props
  };

  return renderWithProviders(<BlockEditor {...defaultProps} />);
};

// StackEditor testing utilities
export interface StackEditorTestProps {
  registry?: StackRegistry;
  program?: StackProgram;
  onChange?: (program: StackProgram) => void;
}

export const renderStackEditor = (props: StackEditorTestProps = {}) => {
  const { StackEditor } = require('../../src/scratch/StackEditor');
  
  const defaultProps = {
    registry: createMockStackRegistry(),
    program: createMockStackProgram({ complexity: 'simple' }),
    onChange: vi.fn(),
    ...props
  };

  return renderWithProviders(<StackEditor {...defaultProps} />);
};

// User interaction utilities for components

/**
 * Simulates dragging a block from the palette to the canvas
 */
export const dragBlockFromPalette = async (
  paletteItem: HTMLElement,
  dropTarget: HTMLElement,
  blockKind: string
) => {
  const user = userEvent.setup();

  // Start drag from palette
  await user.pointer({ target: paletteItem, keys: '[MouseLeft>]' });
  
  // Simulate drag data
  const dragEvent = new DragEvent('dragstart', {
    bubbles: true,
    cancelable: true,
    dataTransfer: new DataTransfer()
  });
  dragEvent.dataTransfer?.setData('text/plain', blockKind);
  paletteItem.dispatchEvent(dragEvent);

  // Drop on target
  const dropEvent = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    dataTransfer: dragEvent.dataTransfer
  });
  dropTarget.dispatchEvent(dropEvent);

  await user.pointer({ keys: '[/MouseLeft]' });
};

/**
 * Simulates connecting two ports by clicking them
 */
export const connectPorts = async (
  outputPort: HTMLElement,
  inputPort: HTMLElement
) => {
  const user = userEvent.setup();
  
  // Click output port first
  await user.click(outputPort);
  
  // Then click input port to create connection
  await user.click(inputPort);
};

/**
 * Simulates dragging a node to a new position
 */
export const dragNodeToPosition = async (
  nodeElement: HTMLElement,
  targetX: number,
  targetY: number
) => {
  const user = userEvent.setup();
  
  const nodeRect = nodeElement.getBoundingClientRect();
  const startX = nodeRect.left + nodeRect.width / 2;
  const startY = nodeRect.top + nodeRect.height / 2;

  await user.pointer([
    { target: nodeElement, coords: { x: startX, y: startY }, keys: '[MouseLeft>]' },
    { coords: { x: targetX, y: targetY } },
    { keys: '[/MouseLeft]' }
  ]);
};

/**
 * Simulates editing a node's configuration value
 */
export const editNodeValue = async (
  valueElement: HTMLElement,
  newValue: string
) => {
  const user = userEvent.setup();
  
  // Click to start editing
  await user.click(valueElement);
  
  // Find the input that should appear
  const input = valueElement.querySelector('input') || 
                document.querySelector('input[type="number"]');
  
  if (input) {
    await user.clear(input);
    await user.type(input, newValue);
    await user.keyboard('{Enter}');
  }
};

/**
 * Simulates removing a node by clicking its delete button
 */
export const deleteNode = async (nodeElement: HTMLElement) => {
  const user = userEvent.setup();
  
  const deleteButton = nodeElement.querySelector('button');
  if (deleteButton) {
    await user.click(deleteButton);
  }
};

// Stack editor specific utilities

/**
 * Simulates dragging a stack block from palette to script area
 */
export const dragStackBlockFromPalette = async (
  paletteItem: HTMLElement,
  dropTarget: HTMLElement,
  blockKind: string
) => {
  const user = userEvent.setup();

  await user.pointer({ target: paletteItem, keys: '[MouseLeft>]' });
  
  const dragEvent = new DragEvent('dragstart', {
    bubbles: true,
    cancelable: true,
    dataTransfer: new DataTransfer()
  });
  dragEvent.dataTransfer?.setData('text/plain', blockKind);
  paletteItem.dispatchEvent(dragEvent);

  const dropEvent = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    dataTransfer: dragEvent.dataTransfer
  });
  dropTarget.dispatchEvent(dropEvent);

  await user.pointer({ keys: '[/MouseLeft]' });
};

/**
 * Simulates moving an existing stack block to a new position
 */
export const moveStackBlock = async (
  blockElement: HTMLElement,
  dropTarget: HTMLElement,
  nodeId: string
) => {
  const user = userEvent.setup();

  await user.pointer({ target: blockElement, keys: '[MouseLeft>]' });
  
  const dragEvent = new DragEvent('dragstart', {
    bubbles: true,
    cancelable: true,
    dataTransfer: new DataTransfer()
  });
  dragEvent.dataTransfer?.setData('text/plain', `existing:${nodeId}`);
  blockElement.dispatchEvent(dragEvent);

  const dropEvent = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    dataTransfer: dragEvent.dataTransfer
  });
  dropTarget.dispatchEvent(dropEvent);

  await user.pointer({ keys: '[/MouseLeft]' });
};

/**
 * Simulates filling in an input field on a stack block
 */
export const fillStackBlockInput = async (
  inputElement: HTMLElement,
  value: string
) => {
  const user = userEvent.setup();
  
  await user.clear(inputElement);
  await user.type(inputElement, value);
};

/**
 * Simulates deleting a stack block
 */
export const deleteStackBlock = async (blockElement: HTMLElement) => {
  const user = userEvent.setup();
  
  const deleteButton = blockElement.querySelector('button[title="Delete block"]');
  if (deleteButton) {
    await user.click(deleteButton);
  }
};

// Test data helpers for components

/**
 * Creates a complete test setup for BlockEditor testing
 */
export const createBlockEditorTestSetup = () => {
  const registry = createMockBlockRegistry();
  const mockGraphStore = createMockGraphStore();
  
  return {
    registry,
    mockGraphStore,
    render: (props?: Partial<BlockEditorTestProps>) =>
      renderBlockEditor({ registry, ...props })
  };
};

/**
 * Creates a complete test setup for StackEditor testing
 */
export const createStackEditorTestSetup = () => {
  const registry = createMockStackRegistry();
  const program = createMockStackProgram({ complexity: 'simple' });
  const onChange = vi.fn();
  
  return {
    registry,
    program,
    onChange,
    render: (props?: Partial<StackEditorTestProps>) =>
      renderStackEditor({ registry, program, onChange, ...props })
  };
};

// Assertion helpers for components

/**
 * Asserts that a specific number of palette items are rendered
 */
export const expectPaletteItems = (count: number) => {
  const { screen } = require('@testing-library/react');
  const paletteItems = screen.getAllByRole('button', { name: /drag/i });
  expect(paletteItems).toHaveLength(count);
};

/**
 * Asserts that a specific number of nodes are rendered on the canvas
 */
export const expectCanvasNodes = (count: number) => {
  const { screen } = require('@testing-library/react');
  const nodes = screen.queryAllByTestId(/node-/);
  expect(nodes).toHaveLength(count);
};

/**
 * Asserts that a specific number of links are rendered
 */
export const expectCanvasLinks = (count: number) => {
  const { screen } = require('@testing-library/react');
  const links = screen.queryAllByTestId(/link-/);
  expect(links).toHaveLength(count);
};

/**
 * Asserts that a stack program has a specific structure
 */
export const expectStackProgramStructure = (
  program: StackProgram,
  expectedHeadCount: number,
  expectedNodeCount: number
) => {
  expect(program.heads).toHaveLength(expectedHeadCount);
  expect(Object.keys(program.nodes)).toHaveLength(expectedNodeCount);
};

// Mock implementations for external dependencies

/**
 * Mocks the nanoid function for consistent test IDs
 */
export const mockNanoid = () => {
  let counter = 0;
  return vi.fn(() => `test-id-${++counter}`);
};

/**
 * Mocks canvas context for components that use canvas
 */
export const mockCanvasContext = () => {
  const context = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Array(4) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  };

  HTMLCanvasElement.prototype.getContext = vi.fn(() => context);
  return context;
};