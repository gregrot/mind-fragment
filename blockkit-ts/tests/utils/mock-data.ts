import { nanoid } from 'nanoid';
import type { 
  GraphData, 
  NodeInstance, 
  LinkEdge, 
  BlockSpec, 
  PortSpec,
  ValueType 
} from '../../src/types';
import type { 
  StackProgram, 
  StackNode, 
  StackBlockSpec, 
  StackForm,
  InputValue 
} from '../../src/scratch/stackTypes';

// Factory functions for creating test data

/**
 * Creates a mock NodeInstance for testing
 */
export const createMockNode = (overrides: Partial<NodeInstance> = {}): NodeInstance => ({
  id: nanoid(),
  kind: 'test-block',
  x: 100,
  y: 100,
  config: {},
  ...overrides
});

/**
 * Creates a mock LinkEdge for testing
 */
export const createMockLink = (overrides: Partial<LinkEdge> = {}): LinkEdge => ({
  id: nanoid(),
  from: { nodeId: 'node1', portKey: 'output' },
  to: { nodeId: 'node2', portKey: 'input' },
  ...overrides
});

/**
 * Creates a mock GraphData structure for testing
 */
export const createMockGraph = (options: {
  nodeCount?: number;
  linkCount?: number;
  nodes?: NodeInstance[];
  links?: LinkEdge[];
} = {}): GraphData => {
  const { nodeCount = 2, linkCount = 1, nodes, links } = options;
  
  const mockNodes = nodes || Array.from({ length: nodeCount }, (_, i) => 
    createMockNode({
      id: `node${i + 1}`,
      kind: `block-${i + 1}`,
      x: 100 + i * 200,
      y: 100
    })
  );
  
  const mockLinks = links || Array.from({ length: linkCount }, (_, i) => 
    createMockLink({
      id: `link${i + 1}`,
      from: { nodeId: mockNodes[i]?.id || 'node1', portKey: 'output' },
      to: { nodeId: mockNodes[i + 1]?.id || 'node2', portKey: 'input' }
    })
  );
  
  return {
    nodes: mockNodes,
    links: mockLinks
  };
};

/**
 * Creates a mock StackNode for testing
 */
export const createMockStackNode = (overrides: Partial<StackNode> = {}): StackNode => ({
  id: nanoid(),
  kind: 'test-stack-block',
  form: 'statement',
  inputs: {},
  slotHeads: {},
  config: {},
  ...overrides
});

/**
 * Creates a mock StackProgram for testing
 */
export const createMockStackProgram = (options: {
  nodeCount?: number;
  complexity?: 'simple' | 'complex';
} = {}): StackProgram => {
  const { nodeCount = 3, complexity = 'simple' } = options;
  
  if (complexity === 'simple') {
    const nodes: Record<string, StackNode> = {};
    const heads: string[] = [];
    
    for (let i = 0; i < nodeCount; i++) {
      const id = `node${i + 1}`;
      const isFirst = i === 0;
      const isLast = i === nodeCount - 1;
      
      nodes[id] = createMockStackNode({
        id,
        kind: `stack-block-${i + 1}`,
        form: isFirst ? 'hat' : 'statement',
        next: isLast ? null : `node${i + 2}`
      });
      
      if (isFirst) {
        heads.push(id);
      }
    }
    
    return { heads, nodes };
  }
  
  // Complex structure with nested blocks and C-blocks
  const nodes: Record<string, StackNode> = {
    'hat1': createMockStackNode({
      id: 'hat1',
      kind: 'when-flag-clicked',
      form: 'hat',
      next: 'repeat1'
    }),
    'repeat1': createMockStackNode({
      id: 'repeat1',
      kind: 'repeat',
      form: 'c',
      inputs: { times: { literal: 10 } },
      slotHeads: { DO: 'move1' },
      next: 'say1'
    }),
    'move1': createMockStackNode({
      id: 'move1',
      kind: 'move',
      form: 'statement',
      inputs: { steps: { literal: 10 } },
      parent: 'repeat1',
      inSlot: 'DO'
    }),
    'say1': createMockStackNode({
      id: 'say1',
      kind: 'say',
      form: 'statement',
      inputs: { message: { literal: 'Hello!' } }
    })
  };
  
  return { heads: ['hat1'], nodes };
};

// Mock registry data

/**
 * Creates a mock BlockSpec for testing
 */
export const createMockBlockSpec = (overrides: Partial<BlockSpec> = {}): BlockSpec => ({
  kind: 'test-block',
  label: 'Test Block',
  inputs: [
    { key: 'input1', label: 'Input 1', type: 'number' as ValueType },
    { key: 'input2', label: 'Input 2', type: 'string' as ValueType }
  ],
  outputs: [
    { key: 'output1', label: 'Output 1', type: 'number' as ValueType }
  ],
  color: '#4CAF50',
  evaluate: ({ inputs }) => ({ output1: (inputs.input1 as number) + 1 }),
  ...overrides
});

/**
 * Creates a mock StackBlockSpec for testing
 */
export const createMockStackBlockSpec = (overrides: Partial<StackBlockSpec> = {}): StackBlockSpec => ({
  kind: 'test-stack-block',
  label: 'Test Stack Block',
  form: 'statement',
  inputs: [
    { key: 'input1', type: 'number' }
  ],
  execute: async () => {},
  ...overrides
});

/**
 * Creates a collection of common test block specs
 */
export const createTestBlockSpecs = (): BlockSpec[] => [
  createMockBlockSpec({
    kind: 'number-input',
    label: 'Number',
    inputs: [],
    outputs: [{ key: 'value', type: 'number' }],
    evaluate: ({ config }) => ({ value: config?.value || 0 })
  }),
  createMockBlockSpec({
    kind: 'add',
    label: 'Add',
    inputs: [
      { key: 'a', type: 'number' },
      { key: 'b', type: 'number' }
    ],
    outputs: [{ key: 'result', type: 'number' }],
    evaluate: ({ inputs }) => ({ result: (inputs.a as number) + (inputs.b as number) })
  }),
  createMockBlockSpec({
    kind: 'multiply',
    label: 'Multiply',
    inputs: [
      { key: 'a', type: 'number' },
      { key: 'b', type: 'number' }
    ],
    outputs: [{ key: 'result', type: 'number' }],
    evaluate: ({ inputs }) => ({ result: (inputs.a as number) * (inputs.b as number) })
  })
];

/**
 * Creates a collection of common test stack block specs
 */
export const createTestStackBlockSpecs = (): StackBlockSpec[] => [
  createMockStackBlockSpec({
    kind: 'when-flag-clicked',
    label: 'When flag clicked',
    form: 'hat'
  }),
  createMockStackBlockSpec({
    kind: 'move',
    label: 'Move {} steps',
    form: 'statement',
    inputs: [{ key: 'steps', type: 'number' }]
  }),
  createMockStackBlockSpec({
    kind: 'repeat',
    label: 'Repeat {} times',
    form: 'c',
    inputs: [{ key: 'times', type: 'number' }],
    slots: [{ key: 'DO', accepts: 'statement' }]
  }),
  createMockStackBlockSpec({
    kind: 'random',
    label: 'Random {} to {}',
    form: 'reporter',
    inputs: [
      { key: 'from', type: 'number' },
      { key: 'to', type: 'number' }
    ]
  })
];

// Predefined test scenarios

/**
 * Creates a simple linear graph for testing
 */
export const createSimpleLinearGraph = (): GraphData => {
  const node1 = createMockNode({
    id: 'input-node',
    kind: 'number-input',
    x: 100,
    y: 100,
    config: { value: 5 }
  });
  
  const node2 = createMockNode({
    id: 'add-node',
    kind: 'add',
    x: 300,
    y: 100
  });
  
  const link = createMockLink({
    id: 'link1',
    from: { nodeId: 'input-node', portKey: 'value' },
    to: { nodeId: 'add-node', portKey: 'a' }
  });
  
  return {
    nodes: [node1, node2],
    links: [link]
  };
};

/**
 * Creates a complex branching graph for testing
 */
export const createComplexGraph = (): GraphData => {
  const nodes = [
    createMockNode({ id: 'input1', kind: 'number-input', x: 50, y: 50, config: { value: 10 } }),
    createMockNode({ id: 'input2', kind: 'number-input', x: 50, y: 150, config: { value: 5 } }),
    createMockNode({ id: 'add1', kind: 'add', x: 250, y: 100 }),
    createMockNode({ id: 'multiply1', kind: 'multiply', x: 450, y: 100 }),
    createMockNode({ id: 'input3', kind: 'number-input', x: 250, y: 200, config: { value: 2 } })
  ];
  
  const links = [
    createMockLink({ 
      from: { nodeId: 'input1', portKey: 'value' }, 
      to: { nodeId: 'add1', portKey: 'a' } 
    }),
    createMockLink({ 
      from: { nodeId: 'input2', portKey: 'value' }, 
      to: { nodeId: 'add1', portKey: 'b' } 
    }),
    createMockLink({ 
      from: { nodeId: 'add1', portKey: 'result' }, 
      to: { nodeId: 'multiply1', portKey: 'a' } 
    }),
    createMockLink({ 
      from: { nodeId: 'input3', portKey: 'value' }, 
      to: { nodeId: 'multiply1', portKey: 'b' } 
    })
  ];
  
  return { nodes, links };
};

/**
 * Creates a simple stack program for testing
 */
export const createSimpleStackProgram = (): StackProgram => {
  return createMockStackProgram({ complexity: 'simple', nodeCount: 3 });
};

/**
 * Creates a complex nested stack program for testing
 */
export const createComplexStackProgram = (): StackProgram => {
  return createMockStackProgram({ complexity: 'complex' });
};