import { render, RenderOptions, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement } from 'react';
import { vi } from 'vitest';
import type { GraphData, NodeInstance, LinkEdge } from '../../src/types';
import type { StackProgram } from '../../src/scratch/stackTypes';

// Custom render function that includes providers if needed
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { ...options });

export * from '@testing-library/react';
export { customRender as render, userEvent };

// Helper function to create test IDs
export const createTestId = (component: string, element?: string) => {
  return element ? `${component}-${element}` : component;
};

// Helper function to wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Helper function to create mock functions with proper typing
export const createMockFn = <T extends (...args: any[]) => any>(
  implementation?: T
) => {
  return vi.fn(implementation) as T & ReturnType<typeof vi.fn>;
};

// Graph testing utilities

/**
 * Validates that a graph structure is well-formed
 */
export const validateGraphStructure = (graph: GraphData): boolean => {
  const nodeIds = new Set(graph.nodes.map(n => n.id));
  
  // Check that all links reference existing nodes
  for (const link of graph.links) {
    if (!nodeIds.has(link.from.nodeId) || !nodeIds.has(link.to.nodeId)) {
      return false;
    }
  }
  
  // Check for duplicate node IDs
  if (nodeIds.size !== graph.nodes.length) {
    return false;
  }
  
  return true;
};

/**
 * Finds a node by its kind in a graph
 */
export const findNodeByKind = (graph: GraphData, kind: string): NodeInstance | undefined => {
  return graph.nodes.find(node => node.kind === kind);
};

/**
 * Finds all links connected to a specific node
 */
export const findLinksForNode = (graph: GraphData, nodeId: string): LinkEdge[] => {
  return graph.links.filter(link => 
    link.from.nodeId === nodeId || link.to.nodeId === nodeId
  );
};

/**
 * Creates a graph with a circular dependency for error testing
 */
export const createCircularGraph = (): GraphData => {
  const nodes = [
    { id: 'node1', kind: 'add', x: 100, y: 100 },
    { id: 'node2', kind: 'multiply', x: 300, y: 100 }
  ];
  
  const links = [
    {
      id: 'link1',
      from: { nodeId: 'node1', portKey: 'result' },
      to: { nodeId: 'node2', portKey: 'a' }
    },
    {
      id: 'link2', 
      from: { nodeId: 'node2', portKey: 'result' },
      to: { nodeId: 'node1', portKey: 'a' }
    }
  ];
  
  return { nodes, links };
};

// Stack program testing utilities

/**
 * Validates that a stack program structure is well-formed
 */
export const validateStackProgram = (program: StackProgram): boolean => {
  const nodeIds = new Set(Object.keys(program.nodes));
  
  // Check that all head references exist
  for (const headId of program.heads) {
    if (!nodeIds.has(headId)) {
      return false;
    }
  }
  
  // Check that all next/parent references are valid
  for (const node of Object.values(program.nodes)) {
    if (node.next && !nodeIds.has(node.next)) {
      return false;
    }
    if (node.parent && !nodeIds.has(node.parent)) {
      return false;
    }
    
    // Check slot head references
    if (node.slotHeads) {
      for (const slotHeadId of Object.values(node.slotHeads)) {
        if (slotHeadId && !nodeIds.has(slotHeadId)) {
          return false;
        }
      }
    }
    
    // Check input block references
    if (node.inputs) {
      for (const inputValue of Object.values(node.inputs)) {
        if ('blockId' in inputValue && !nodeIds.has(inputValue.blockId)) {
          return false;
        }
      }
    }
  }
  
  return true;
};

/**
 * Finds all nodes of a specific form in a stack program
 */
export const findNodesByForm = (program: StackProgram, form: string) => {
  return Object.values(program.nodes).filter(node => node.form === form);
};

/**
 * Gets the execution order of nodes in a stack program starting from a head
 */
export const getExecutionOrder = (program: StackProgram, headId: string): string[] => {
  const order: string[] = [];
  let current = program.nodes[headId];
  
  while (current) {
    order.push(current.id);
    current = current.next ? program.nodes[current.next] : undefined;
  }
  
  return order;
};

// Component testing utilities

/**
 * Simulates a canvas click at specific coordinates
 */
export const simulateCanvasClick = async (canvas: HTMLElement, x: number, y: number) => {
  const user = userEvent.setup();
  
  await user.pointer({
    target: canvas,
    coords: { x, y },
    keys: '[MouseLeft]'
  });
};

/**
 * Simulates dragging from one point to another
 */
export const simulateDrag = async (
  element: HTMLElement, 
  from: { x: number; y: number }, 
  to: { x: number; y: number }
) => {
  const user = userEvent.setup();
  
  await user.pointer([
    { target: element, coords: from, keys: '[MouseLeft>]' },
    { coords: to },
    { keys: '[/MouseLeft]' }
  ]);
};

// Assertion helpers

/**
 * Custom matcher for checking if a graph contains a specific node
 */
export const expectGraphToContainNode = (graph: GraphData, nodeId: string) => {
  const node = graph.nodes.find(n => n.id === nodeId);
  expect(node).toBeDefined();
  return node!;
};

/**
 * Custom matcher for checking if a graph contains a specific link
 */
export const expectGraphToContainLink = (
  graph: GraphData, 
  from: { nodeId: string; portKey: string }, 
  to: { nodeId: string; portKey: string }
) => {
  const link = graph.links.find(l => 
    l.from.nodeId === from.nodeId && 
    l.from.portKey === from.portKey &&
    l.to.nodeId === to.nodeId && 
    l.to.portKey === to.portKey
  );
  expect(link).toBeDefined();
  return link!;
};

/**
 * Waits for a specific number of nodes to be rendered
 */
export const waitForNodes = async (count: number) => {
  await waitFor(() => {
    const nodes = screen.queryAllByTestId(/node-/);
    expect(nodes).toHaveLength(count);
  });
};

/**
 * Waits for a specific number of links to be rendered
 */
export const waitForLinks = async (count: number) => {
  await waitFor(() => {
    const links = screen.queryAllByTestId(/link-/);
    expect(links).toHaveLength(count);
  });
};

// Performance testing utilities

/**
 * Measures execution time of a function
 */
export const measureExecutionTime = async <T>(fn: () => Promise<T> | T): Promise<{ result: T; time: number }> => {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return { result, time: end - start };
};

/**
 * Creates a large graph for performance testing
 */
export const createLargeGraph = (nodeCount: number): GraphData => {
  const nodes: NodeInstance[] = [];
  const links: LinkEdge[] = [];
  
  // Create nodes in a grid pattern
  const gridSize = Math.ceil(Math.sqrt(nodeCount));
  for (let i = 0; i < nodeCount; i++) {
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;
    
    nodes.push({
      id: `node${i}`,
      kind: i % 2 === 0 ? 'add' : 'multiply',
      x: col * 150 + 100,
      y: row * 150 + 100
    });
  }
  
  // Create links between adjacent nodes
  for (let i = 0; i < nodeCount - 1; i++) {
    if ((i + 1) % gridSize !== 0) { // Not at the end of a row
      links.push({
        id: `link${i}`,
        from: { nodeId: `node${i}`, portKey: 'result' },
        to: { nodeId: `node${i + 1}`, portKey: 'a' }
      });
    }
  }
  
  return { nodes, links };
};

// Error testing utilities

/**
 * Expects a function to throw a specific error
 */
export const expectToThrowError = async (fn: () => Promise<any> | any, expectedMessage?: string) => {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (expectedMessage) {
      expect(error).toHaveProperty('message', expectedMessage);
    }
    return error;
  }
};