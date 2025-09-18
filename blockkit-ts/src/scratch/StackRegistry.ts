import { StackBlockSpec } from "./stackTypes";

export class StackRegistry {
  private specs = new Map<string, StackBlockSpec>();
  
  register<T>(spec: StackBlockSpec<T>) {
    if (this.specs.has(spec.kind)) throw new Error(`dup kind ${spec.kind}`);
    this.specs.set(spec.kind, spec);
    return this;
  }
  
  get(kind: string) { return this.specs.get(kind); }
  all() { return Array.from(this.specs.values()); }
}