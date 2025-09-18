import type { StackBlockSpec } from "./stackTypes";

export const WhenStarted: StackBlockSpec = {
  kind: "event.whenStarted",
  label: "when started",
  form: "hat",
  slots: [{ key: "DO", label: "do" }],
  async execute({ runSlot }) { 
    console.log("🚀 Starting script...");
    await runSlot("DO"); 
  }
};

export const Repeat: StackBlockSpec<{ times: number }> = {
  kind: "control.repeat",
  label: "repeat 10 times",
  form: "c",
  slots: [{ key: "DO", label: "do" }],
  async execute({ runSlot, config }) {
    const n = (config?.times ?? 10) as number;
    console.log(`🔄 Repeating ${n} times...`);
    for (let i = 0; i < n; i++) {
      console.log(`  Loop ${i + 1}/${n}`);
      await runSlot("DO");
    }
  }
};

export const If: StackBlockSpec = {
  kind: "control.if",
  label: "if",
  form: "c",
  inputs: [{ key: "condition", type: "boolean" }],
  slots: [{ key: "THEN", label: "then" }],
  async execute({ getInput, runSlot }) {
    const condition = await getInput("condition");
    if (condition) {
      console.log("✅ Condition is true, executing then block");
      await runSlot("THEN");
    } else {
      console.log("❌ Condition is false, skipping then block");
    }
  }
};

export const Log: StackBlockSpec<{ msg: string }> = {
  kind: "looks.log",
  label: "say hello",
  form: "statement",
  async execute({ config }) { 
    const msg = config?.msg ?? "Hello, World!";
    console.log(`💬 ${msg}`); 
  }
};

export const Wait: StackBlockSpec<{ seconds: number }> = {
  kind: "control.wait",
  label: "wait 1 second",
  form: "statement",
  async execute({ config }) {
    const seconds = (config?.seconds ?? 1) as number;
    console.log(`⏱️  Waiting ${seconds} second(s)...`);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
};

export const Add: StackBlockSpec = {
  kind: "op.add",
  label: "+",
  form: "reporter",
  inputs: [{ key: "a", type: "number" }, { key: "b", type: "number" }],
  execute: async ({ getInput }) => {
    const a = Number(await getInput("a") ?? 0);
    const b = Number(await getInput("b") ?? 0);
    const result = a + b;
    console.log(`🧮 ${a} + ${b} = ${result}`);
    return result;
  }
};

export const Random: StackBlockSpec<{ min: number; max: number }> = {
  kind: "op.random",
  label: "random 1 to 10",
  form: "reporter",
  execute: async ({ config }) => {
    const min = config?.min ?? 1;
    const max = config?.max ?? 10;
    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log(`🎲 Random number: ${result} (between ${min} and ${max})`);
    return result;
  }
};

export const GreaterThan: StackBlockSpec = {
  kind: "op.gt",
  label: "> greater than",
  form: "predicate",
  inputs: [{ key: "a", type: "number" }, { key: "b", type: "number" }],
  execute: async ({ getInput }) => {
    const a = Number(await getInput("a") ?? 0);
    const b = Number(await getInput("b") ?? 0);
    const result = a > b;
    console.log(`🔍 ${a} > ${b} = ${result}`);
    return result;
  }
};

export const DefaultStackBlocks = [
  WhenStarted, 
  Repeat, 
  If, 
  Log, 
  Wait, 
  Add, 
  Random, 
  GreaterThan
];