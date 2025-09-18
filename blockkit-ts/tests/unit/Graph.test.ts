import { describe, it, expect, beforeEach } from 'vitest';
import { useGraph, serialize } from '../../src/Graph';
import type { GraphData, NodeInstance, LinkEdge } from '../../src/types';

describe('Graph State Management', () => {
  beforeEach(() => {
    // Reset the store before each test
    useGraph.getState().load({ nodes: [], links: [] });
  });

  describe('node operations', () => {
    it('should add a node with generated ID', () => {
      const { addNode } = useGraph.getState();
      
      const nodeId = addNode({
        kind: 'test.block',
        x: 100,
        y: 200,
        config: { value: 42 }
      });

      expect(nodeId).toBeDefined();
      expect(typeof nodeId).toBe('string');
      
      const { nodes } = useGraph.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual({
        id: nodeId,
        kind: 'test.block',
        x: 100,
        y: 200,
        config: { value: 42 }
      });
    });

    it('should add a node with provided ID', () => {
      const { addNode } = useGraph.getState();
      
      const nodeId = addNode({
        id: 'custom-id',
        kind: 'test.block',
        x: 50,
        y: 75
      });

      expect(nodeId).toBe('custom-id');
      
      const { nodes } = useGraph.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe('custom-id');
    });

    it('should move a node to new position', () => {
      const { addNode, moveNode } = useGraph.getState();
      
      const nodeId = addNode({
        kind: 'test.block',
        x: 100,
        y: 200
      });

      moveNode(nodeId, 300, 400);

      const { nodes } = useGraph.getState();
      expect(nodes[0].x).toBe(300);
      expect(nodes[0].y).toBe(400);
      expect(nodes[0].kind).toBe('test.block'); // other properties unchanged
    });

    it('should update node properties', () => {
      const { addNode, updateNode } = useGraph.getState();
      
      const nodeId = addNode({
        kind: 'test.block',
        x: 100,
        y: 200,
        config: { value: 42 }
      });

      updateNode(nodeId, {
        kind: 'updated.block',
        config: { value: 84, newProp: 'test' }
      });

      const { nodes } = useGraph.getState();
      expect(nodes[0]).toEqual({
        id: nodeId,
        kind: 'updated.block',
        x: 100, // unchanged
        y: 200, // unchanged
        config: { value: 84, newProp: 'test' }
      });
    });

    it('should remove a node', () => {
      const { addNode, removeNode } = useGraph.getState();
      
      const nodeId1 = addNode({ kind: 'block1', x: 0, y: 0 });
      const nodeId2 = addNode({ kind: 'block2', x: 100, y: 100 });

      removeNode(nodeId1);

      const { nodes } = useGraph.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe(nodeId2);
    });

    it('should handle moving non-existent node gracefully', () => {
      const { moveNode } = useGraph.getState();
      
      // Should not throw error
      expect(() => moveNode('non-existent', 100, 200)).not.toThrow();
      
      const { nodes } = useGraph.getState();
      expect(nodes).toHaveLength(0);
    });

    it('should handle updating non-existent node gracefully', () => {
      const { updateNode } = useGraph.getState();
      
      // Should not throw error
      expect(() => updateNode('non-existent', { kind: 'new.kind' })).not.toThrow();
      
      const { nodes } = useGraph.getState();
      expect(nodes).toHaveLength(0);
    });
  });

  describe('link operations', () => {
    let nodeId1: string;
    let nodeId2: string;

    beforeEach(() => {
      const { addNode } = useGraph.getState();
      nodeId1 = addNode({ kind: 'source', x: 0, y: 0 });
      nodeId2 = addNode({ kind: 'target', x: 100, y: 100 });
    });

    it('should add a link between nodes', () => {
      const { addLink } = useGraph.getState();
      
      const linkId = addLink(
        { nodeId: nodeId1, portKey: 'output' },
        { nodeId: nodeId2, portKey: 'input' }
      );

      expect(linkId).toBeDefined();
      expect(typeof linkId).toBe('string');
      
      const { links } = useGraph.getState();
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        id: linkId,
        from: { nodeId: nodeId1, portKey: 'output' },
        to: { nodeId: nodeId2, portKey: 'input' }
      });
    });

    it('should prevent duplicate links', () => {
      const { addLink } = useGraph.getState();
      
      const from = { nodeId: nodeId1, portKey: 'output' };
      const to = { nodeId: nodeId2, portKey: 'input' };
      
      const linkId1 = addLink(from, to);
      const linkId2 = addLink(from, to); // duplicate

      expect(linkId1).toBeDefined();
      expect(linkId2).toBeNull();
      
      const { links } = useGraph.getState();
      expect(links).toHaveLength(1);
    });

    it('should allow multiple links from same node to different ports', () => {
      const { addLink } = useGraph.getState();
      
      const linkId1 = addLink(
        { nodeId: nodeId1, portKey: 'output' },
        { nodeId: nodeId2, portKey: 'input1' }
      );
      const linkId2 = addLink(
        { nodeId: nodeId1, portKey: 'output' },
        { nodeId: nodeId2, portKey: 'input2' }
      );

      expect(linkId1).toBeDefined();
      expect(linkId2).toBeDefined();
      
      const { links } = useGraph.getState();
      expect(links).toHaveLength(2);
    });

    it('should remove a link', () => {
      const { addLink, removeLink } = useGraph.getState();
      
      const linkId1 = addLink(
        { nodeId: nodeId1, portKey: 'output1' },
        { nodeId: nodeId2, portKey: 'input1' }
      );
      const linkId2 = addLink(
        { nodeId: nodeId1, portKey: 'output2' },
        { nodeId: nodeId2, portKey: 'input2' }
      );

      removeLink(linkId1!);

      const { links } = useGraph.getState();
      expect(links).toHaveLength(1);
      expect(links[0].id).toBe(linkId2);
    });

    it('should handle removing non-existent link gracefully', () => {
      const { removeLink } = useGraph.getState();
      
      // Should not throw error
      expect(() => removeLink('non-existent')).not.toThrow();
      
      const { links } = useGraph.getState();
      expect(links).toHaveLength(0);
    });
  });

  describe('node removal cascading to links', () => {
    it('should remove all links connected to a removed node', () => {
      const { addNode, addLink, removeNode } = useGraph.getState();
      
      const node1 = addNode({ kind: 'node1', x: 0, y: 0 });
      const node2 = addNode({ kind: 'node2', x: 100, y: 100 });
      const node3 = addNode({ kind: 'node3', x: 200, y: 200 });

      // Create links: node1 -> node2, node2 -> node3
      addLink(
        { nodeId: node1, portKey: 'out' },
        { nodeId: node2, portKey: 'in' }
      );
      addLink(
        { nodeId: node2, portKey: 'out' },
        { nodeId: node3, portKey: 'in' }
      );

      expect(useGraph.getState().links).toHaveLength(2);

      // Remove node2 - should remove both links
      removeNode(node2);

      const { nodes, links } = useGraph.getState();
      expect(nodes).toHaveLength(2);
      expect(nodes.map(n => n.id)).toEqual([node1, node3]);
      expect(links).toHaveLength(0);
    });

    it('should only remove links connected to the removed node', () => {
      const { addNode, addLink, removeNode } = useGraph.getState();
      
      const node1 = addNode({ kind: 'node1', x: 0, y: 0 });
      const node2 = addNode({ kind: 'node2', x: 100, y: 100 });
      const node3 = addNode({ kind: 'node3', x: 200, y: 200 });
      const node4 = addNode({ kind: 'node4', x: 300, y: 300 });

      // Create links: node1 -> node2, node3 -> node4
      addLink(
        { nodeId: node1, portKey: 'out' },
        { nodeId: node2, portKey: 'in' }
      );
      addLink(
        { nodeId: node3, portKey: 'out' },
        { nodeId: node4, portKey: 'in' }
      );

      expect(useGraph.getState().links).toHaveLength(2);

      // Remove node1 - should only remove first link
      removeNode(node1);

      const { nodes, links } = useGraph.getState();
      expect(nodes).toHaveLength(3);
      expect(links).toHaveLength(1);
      expect(links[0].from.nodeId).toBe(node3);
      expect(links[0].to.nodeId).toBe(node4);
    });
  });

  describe('graph serialization and loading', () => {
    it('should serialize current graph state', () => {
      const { addNode, addLink } = useGraph.getState();
      
      const node1 = addNode({ kind: 'test1', x: 10, y: 20, config: { value: 1 } });
      const node2 = addNode({ kind: 'test2', x: 30, y: 40, config: { value: 2 } });
      
      const link1 = addLink(
        { nodeId: node1, portKey: 'out' },
        { nodeId: node2, portKey: 'in' }
      );

      const serialized = serialize();

      expect(serialized).toEqual({
        nodes: [
          { id: node1, kind: 'test1', x: 10, y: 20, config: { value: 1 } },
          { id: node2, kind: 'test2', x: 30, y: 40, config: { value: 2 } }
        ],
        links: [
          {
            id: link1,
            from: { nodeId: node1, portKey: 'out' },
            to: { nodeId: node2, portKey: 'in' }
          }
        ]
      });
    });

    it('should load graph data and replace current state', () => {
      const { addNode, load } = useGraph.getState();
      
      // Add some initial data
      addNode({ kind: 'initial', x: 0, y: 0 });
      expect(useGraph.getState().nodes).toHaveLength(1);

      // Load new data
      const newGraphData: GraphData = {
        nodes: [
          { id: 'loaded1', kind: 'loaded.block1', x: 100, y: 200 },
          { id: 'loaded2', kind: 'loaded.block2', x: 300, y: 400 }
        ],
        links: [
          {
            id: 'link1',
            from: { nodeId: 'loaded1', portKey: 'output' },
            to: { nodeId: 'loaded2', portKey: 'input' }
          }
        ]
      };

      load(newGraphData);

      const { nodes, links } = useGraph.getState();
      expect(nodes).toEqual(newGraphData.nodes);
      expect(links).toEqual(newGraphData.links);
    });

    it('should handle loading empty graph', () => {
      const { addNode, load } = useGraph.getState();
      
      // Add some initial data
      addNode({ kind: 'initial', x: 0, y: 0 });
      expect(useGraph.getState().nodes).toHaveLength(1);

      // Load empty graph
      load({ nodes: [], links: [] });

      const { nodes, links } = useGraph.getState();
      expect(nodes).toEqual([]);
      expect(links).toEqual([]);
    });
  });

  describe('state consistency and immutability', () => {
    it('should maintain state immutability on node operations', () => {
      const { addNode, updateNode } = useGraph.getState();
      
      const nodeId = addNode({ kind: 'test', x: 0, y: 0, config: { value: 1 } });
      const initialState = useGraph.getState();
      const initialNodes = initialState.nodes;
      const initialNode = initialNodes[0];

      updateNode(nodeId, { config: { value: 2 } });

      const newState = useGraph.getState();
      const newNodes = newState.nodes;
      const newNode = newNodes[0];

      // Arrays should be different instances
      expect(newNodes).not.toBe(initialNodes);
      // Node objects should be different instances
      expect(newNode).not.toBe(initialNode);
      // But content should be updated correctly
      expect(newNode.config).toEqual({ value: 2 });
      expect(initialNode.config).toEqual({ value: 1 }); // original unchanged
    });

    it('should maintain state immutability on link operations', () => {
      const { addNode, addLink, removeLink } = useGraph.getState();
      
      const node1 = addNode({ kind: 'node1', x: 0, y: 0 });
      const node2 = addNode({ kind: 'node2', x: 100, y: 100 });
      
      const linkId = addLink(
        { nodeId: node1, portKey: 'out' },
        { nodeId: node2, portKey: 'in' }
      );

      const initialState = useGraph.getState();
      const initialLinks = initialState.links;

      removeLink(linkId!);

      const newState = useGraph.getState();
      const newLinks = newState.links;

      // Arrays should be different instances
      expect(newLinks).not.toBe(initialLinks);
      expect(newLinks).toHaveLength(0);
      expect(initialLinks).toHaveLength(1); // original unchanged
    });

    it('should handle concurrent state updates correctly', () => {
      const { addNode, updateNode, moveNode } = useGraph.getState();
      
      const nodeId = addNode({ kind: 'test', x: 0, y: 0, config: { value: 1 } });

      // Simulate concurrent updates
      updateNode(nodeId, { config: { value: 2 } });
      moveNode(nodeId, 100, 200);
      updateNode(nodeId, { kind: 'updated.test' });

      const { nodes } = useGraph.getState();
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toEqual({
        id: nodeId,
        kind: 'updated.test',
        x: 100,
        y: 200,
        config: { value: 2 }
      });
    });
  });
});