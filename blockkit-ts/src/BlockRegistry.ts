import { BlockSpec, ValueType } from "./types";

export class BlockRegistry {
  private specs = new Map<string, BlockSpec<any>>();

  register<T>(spec: BlockSpec<T>) {
    if (this.specs.has(spec.kind)) throw new Error(`Block kind already registered: ${spec.kind}`);
    this.specs.set(spec.kind, spec as BlockSpec<any>);
    return this;
  }

  get(kind: string) { return this.specs.get(kind); }
  all() { return Array.from(this.specs.values()); }
}

export const isTypeCompatible = (a?: ValueType, b?: ValueType): boolean => {
  if (!a || !b) return true;
  if (a === "any" || b === "any") return true;
  if (typeof a === "string" && typeof b === "string") return a === b;
  const toUnion = (t: ValueType): ValueType[] => typeof t === "string" ? [t] : t.union;
  const au = toUnion(a), bu = toUnion(b);
  return au.some(t => bu.includes(t));
};