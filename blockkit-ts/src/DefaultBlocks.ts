import { z } from "zod";
import type { BlockSpec } from "./types";

export const ConstNumber: BlockSpec<{ value?: number }> = {
  kind: "const.number",
  label: "Number",
  outputs: [{ key: "out", label: "out", type: "number" }],
  configSchema: z.object({
    value: z.number().optional()
  }),
  evaluate: ({ config }) => ({ out: config?.value ?? Math.floor(Math.random() * 101) })
};

export const Add: BlockSpec<{}> = {
  kind: "math.add",
  label: "+",
  inputs: [
    { key: "a", type: "number", defaultValue: 0 },
    { key: "b", type: "number", defaultValue: 0 }
  ],
  outputs: [{ key: "sum", type: "number" }],
  evaluate: ({ inputs }) => ({ sum: (Number(inputs.a) || 0) + (Number(inputs.b) || 0) })
};

export const Multiply: BlockSpec<{}> = {
  kind: "math.mul",
  label: "×",
  inputs: [
    { key: "a", type: "number", defaultValue: 1 },
    { key: "b", type: "number", defaultValue: 1 }
  ],
  outputs: [{ key: "prod", type: "number" }],
  evaluate: ({ inputs }) => ({ prod: (Number(inputs.a) || 1) * (Number(inputs.b) || 1) })
};

export const ToString: BlockSpec<{}> = {
  kind: "to.string",
  label: "toString",
  inputs: [{ key: "value", type: { union: ["number", "boolean", "string"] } }],
  outputs: [{ key: "out", type: "string" }],
  evaluate: ({ inputs }) => ({ out: String(inputs.value) })
};

export const Print: BlockSpec<{ prefix?: string }> = {
  kind: "io.print",
  label: "Print",
  inputs: [{ key: "msg", type: { union: ["string", "number", "boolean"] } }],
  outputs: [{ key: "done", type: "boolean" }],
  evaluate: ({ inputs }) => { console.log(String(inputs.msg)); return { done: true }; }
};

export const DefaultBlocks = [ConstNumber, Add, Multiply, ToString, Print];