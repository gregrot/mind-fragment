// Minimal component model (object-based for clarity). You can swap for bitecs later.
export type EntityId = number;

export interface Position { x: number; y: number }
export interface Velocity { vx: number; vy: number; max: number }
export interface Energy { cur: number; cap: number }
export interface Inventory { items: Record<string, number> }
export interface Modules { list: string[] } // e.g. ["motor","scanner"]
export interface Tags { tags: string[] }    // e.g. ["scrap"]

export interface Program { ast: any | null; running: boolean; budget: number; }

export interface SpriteRef { sprite: Phaser.GameObjects.Sprite }

export interface Entity extends Partial<Position & Velocity & Energy & Inventory & Modules & Tags & Program & SpriteRef> {
  id: EntityId;
  name?: string;
}