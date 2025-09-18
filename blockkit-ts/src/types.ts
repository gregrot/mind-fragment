import { z } from "zod";

export type PortDirection = "in" | "out";
export type ValueType = "number" | "string" | "boolean" | "any" | { union: ValueType[] };

export interface PortSpec {
  key: string;
  label?: string;
  type?: ValueType;
  // Optional default for inputs
  defaultValue?: unknown;
}

export interface BlockSpec<C = unknown> {
  kind: string;               // unique within registry
  label: string;
  inputs?: PortSpec[];
  outputs?: PortSpec[];
  // Optional UI hints
  color?: string;
  icon?: React.ReactNode;
  // Optional config per node instance
  configSchema?: z.ZodType<C>;
  // Runtime function: given resolved input values + config, produce outputs
  evaluate?: (ctx: { inputs: Record<string, unknown>; config: C }) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

export type NodeId = string;
export type PortId = string; // `${nodeId}:${portKey}`

export interface NodeInstance<C = any> {
  id: NodeId;
  kind: string; // BlockSpec.kind
  x: number;    // canvas position
  y: number;
  config?: C;
}

export interface LinkEdge {
  id: string;
  from: { nodeId: NodeId; portKey: string }; // out
  to: { nodeId: NodeId; portKey: string };   // in
}

export interface GraphData {
  nodes: NodeInstance[];
  links: LinkEdge[];
}

export const GraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    x: z.number(),
    y: z.number(),
    config: z.any().optional()
  })),
  links: z.array(z.object({
    id: z.string(),
    from: z.object({ nodeId: z.string(), portKey: z.string() }),
    to: z.object({ nodeId: z.string(), portKey: z.string() })
  }))
});

export type GraphValidation = z.infer<typeof GraphSchema>;