import { StackProgram, StackNode } from "./stackTypes";
import { StackRegistry } from "./StackRegistry";

export class StackInterpreter {
  constructor(private registry: StackRegistry, private state: Record<string,unknown> = {}) {}

  async run(program: StackProgram) {
    // Run all top-level hats (or plain stacks) sequentially for now
    for (const head of program.heads) {
      await this.runFrom(head, program);
    }
  }

  private async runFrom(startId: string, program: StackProgram): Promise<void> {
    let cur: string | null | undefined = startId;
    while (cur) {
      const node: StackNode = program.nodes[cur];
      const spec = this.registry.get(node.kind);
      if (!spec) throw new Error(`Unknown block: ${node.kind}`);

      // Construct helpers
      const getInput = async (key: string) => {
        const iv = node.inputs?.[key];
        if (!iv) return undefined;
        if ("literal" in iv) return iv.literal;
        const sub = program.nodes[iv.blockId];
        const subSpec = this.registry.get(sub.kind)!;
        const val = await subSpec.execute?.({
          getInput: (k: string) => this.evalInput(sub, program, k),
          runSlot: async () => {},
          state: this.state,
          config: (sub.config as any)
        });
        return val;
      };

      const runSlot = async (slotKey: string) => {
        const head = node.slotHeads?.[slotKey] ?? null;
        if (!head) return;
        await this.runFrom(head, program);
      };

      await spec.execute?.({ getInput, runSlot, state: this.state, config: (node.config as any) });
      cur = node.next ?? null;
    }
  }

  private async evalInput(node: StackNode, program: StackProgram, key: string): Promise<unknown> {
    const iv = node.inputs?.[key];
    if (!iv) return undefined;
    if ("literal" in iv) return iv.literal;
    const sub = program.nodes[iv.blockId];
    const subSpec = this.registry.get(sub.kind)!;
    return await subSpec.execute?.({
      getInput: (k: string) => this.evalInput(sub, program, k),
      runSlot: async () => {},
      state: this.state,
      config: (sub.config as any)
    });
  }
}