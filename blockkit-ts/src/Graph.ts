import { create } from "zustand";
import { nanoid } from "nanoid";
import type { GraphData, LinkEdge, NodeInstance } from "./types";

export interface GraphState extends GraphData {
  addNode: (node: Omit<NodeInstance, "id"> & { id?: string }) => string;
  moveNode: (id: string, x: number, y: number) => void;
  updateNode: (id: string, updates: Partial<NodeInstance>) => void;
  removeNode: (id: string) => void;
  addLink: (from: LinkEdge["from"], to: LinkEdge["to"]) => string | null;
  removeLink: (id: string) => void;
  load: (g: GraphData) => void;
}

export const useGraph = create<GraphState>((set, get) => ({
  nodes: [],
  links: [],

  addNode(partial) {
    const id = partial.id ?? nanoid();
    set(s => ({ nodes: [...s.nodes, { id, ...partial }] }));
    return id;
  },

  moveNode(id, x, y) {
    set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, x, y } : n) }));
  },

  updateNode(id, updates) {
    set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, ...updates } : n) }));
  },

  removeNode(id) {
    set(s => ({
      nodes: s.nodes.filter(n => n.id !== id),
      links: s.links.filter(l => l.from.nodeId !== id && l.to.nodeId !== id)
    }));
  },

  addLink(from, to) {
    const id = nanoid();
    const exists = get().links.some(l => l.from.nodeId === from.nodeId && l.from.portKey === from.portKey && l.to.nodeId === to.nodeId && l.to.portKey === to.portKey);
    if (exists) return null;
    set(s => ({ links: [...s.links, { id, from, to }] }));
    return id;
  },

  removeLink(id) { set(s => ({ links: s.links.filter(l => l.id !== id) })); },

  load(g) { set(() => g); }
}));

export const serialize = (): GraphData => {
  const { nodes, links } = useGraph.getState();
  return { nodes: [...nodes], links: [...links] };
};