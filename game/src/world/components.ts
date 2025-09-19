import type Phaser from "phaser";

export type EntityId = number;

export interface ComponentType<T> {
  readonly key: symbol;
  readonly name: string;
  readonly _type?: (value: T) => void;
}

export function defineComponent<T>(name: string): ComponentType<T> {
  return { key: Symbol(name), name };
}

export interface Position { x: number; y: number }
export const Position = defineComponent<Position>("position");

export interface Velocity { vx: number; vy: number; max: number }
export const Velocity = defineComponent<Velocity>("velocity");

export interface Energy { cur: number; cap: number }
export const Energy = defineComponent<Energy>("energy");

export type Inventory = Record<string, number>;
export const Inventory = defineComponent<Inventory>("inventory");

export interface Modules { list: string[] }
export const Modules = defineComponent<Modules>("modules");

export type Tags = string[];
export const Tags = defineComponent<Tags>("tags");

export interface ProgramState { ast: any | null; running: boolean; budget: number }
export const Program = defineComponent<ProgramState>("program");

export interface SpriteRef { sprite: Phaser.GameObjects.Sprite }
export const Sprite = defineComponent<SpriteRef>("sprite");

export interface Identity { name: string }
export const Identity = defineComponent<Identity>("identity");

export type EntityRole = "mind" | "assembler" | "scrap" | "robot" | string;
export const Role = defineComponent<EntityRole>("role");

export type Requirements = Record<string, number>;
export const Requirements = defineComponent<Requirements>("requirements");
