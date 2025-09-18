import { BlockRegistry } from "./BlockRegistry";
import type { GraphData, NodeInstance } from "./types";

export interface ExecutionResult {
  values: Map<string, Record<string, unknown>>; // nodeId -> outputs
}

export class Interpreter {
  constructor(private registry: BlockRegistry) {}

  async run(graph: GraphData): Promise<ExecutionResult> {
    const order = topoSort(graph);
    const values = new Map<string, Record<string, unknown>>();

    for (const nodeId of order) {
      const node = graph.nodes.find(n => n.id === nodeId)!;
      const spec = this.registry.get(node.kind);
      if (!spec) throw new Error(`Unknown block: ${node.kind}`);

      const inputs = resolveInputs(graph, values, node);
      const config = node.config as any;
      const result = spec.evaluate ? await spec.evaluate({ inputs, config }) : {};
      values.set(nodeId, result);
    }

    return { values };
  }
}

function topoSort(graph: GraphData): string[] {
  const incoming = new Map<string, number>();
  graph.nodes.forEach(n => incoming.set(n.id, 0));
  graph.links.forEach(l => incoming.set(l.to.nodeId, (incoming.get(l.to.nodeId) ?? 0) + 1));

  const q: string[] = graph.nodes.filter(n => (incoming.get(n.id) ?? 0) === 0).map(n => n.id);
  const order: string[] = [];

  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    for (const e of graph.links.filter(l => l.from.nodeId === id)) {
      const to = e.to.nodeId;
      incoming.set(to, (incoming.get(to) ?? 1) - 1);
      if ((incoming.get(to) ?? 0) === 0) q.push(to);
    }
  }
  if (order.length !== graph.nodes.length) throw new Error("Graph contains a cycle");
  return order;
}

function resolveInputs(graph: GraphData, values: Map<string, Record<string, unknown>>, node: NodeInstance) {
  const inputs: Record<string, unknown> = {};
  const incoming = graph.links.filter(l => l.to.nodeId === node.id);
  for (const link of incoming) {
    const srcVals = values.get(link.from.nodeId) ?? {};
    inputs[link.to.portKey] = srcVals[link.from.portKey];
  }
  return inputs;
}