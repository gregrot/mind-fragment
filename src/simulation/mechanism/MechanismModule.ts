export interface MechanismModuleDefinition {
  id: string;
  title?: string;
  attachment?: {
    slot?: string;
    index?: number;
  };
  provides?: string[];
  requires?: string[];
  capacityCost?: number;
}

export interface ResolvedMechanismModuleDefinition {
  id: string;
  title: string;
  attachment: {
    slot?: string;
    index?: number;
  };
  provides: string[];
  requires: string[];
  capacityCost: number;
}

export class MechanismModule {
  readonly definition: ResolvedMechanismModuleDefinition;

  constructor(definition: MechanismModuleDefinition) {
    if (!definition?.id) {
      throw new Error('Mechanism modules must define an id.');
    }
    this.definition = {
      id: definition.id,
      title: definition.title ?? definition.id,
      attachment: {
        slot: definition?.attachment?.slot,
        index: definition?.attachment?.index,
      },
      provides: Array.isArray(definition?.provides)
        ? [...new Set(definition.provides)]
        : [],
      requires: Array.isArray(definition?.requires)
        ? [...new Set(definition.requires)]
        : [],
      capacityCost: Number.isFinite(definition?.capacityCost)
        ? Number(definition.capacityCost)
        : 1,
    };
  }

  onAttach(_port?: unknown, _state?: unknown, _context?: unknown): void {
    // Subclasses can override to initialise their runtime state.
  }

  onDetach(): void {
    // Subclasses can override to clean up resources.
  }

  update(_context?: unknown): void {
    // Subclasses can override to implement per-tick behaviour.
  }
}
