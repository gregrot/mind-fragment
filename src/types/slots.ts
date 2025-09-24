export interface SlotMetadata {
  stackable: boolean;
  moduleSubtype?: string;
  locked: boolean;
}

export interface SlotSchema {
  id: string;
  index: number;
  occupantId: string | null;
  stackCount?: number;
  metadata: SlotMetadata;
}
