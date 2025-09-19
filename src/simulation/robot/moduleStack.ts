import type { RobotModule, ResolvedRobotModuleDefinition } from './RobotModule';

const DEFAULT_SLOT = 'stack';

const ensureNumber = (value: unknown, fallback: number): number =>
  Number.isFinite(value) ? (value as number) : fallback;

interface ModuleStackOptions {
  capacity?: number;
}

export interface ModuleMetadata {
  slot: string;
  index: number;
  provides: string[];
  requires: string[];
  capacityCost: number;
}

export interface ModuleSnapshot {
  id: string;
  title: string;
  slot: string;
  index: number;
  provides: string[];
  requires: string[];
  capacityCost: number;
}

export class ModuleStack {
  readonly capacity: number;
  private readonly modules: RobotModule[] = [];
  private readonly moduleMeta = new Map<string, ModuleMetadata>();
  private readonly capabilities = new Set<string>();

  constructor({ capacity = 4 }: ModuleStackOptions = {}) {
    this.capacity = capacity;
  }

  get capacityUsed(): number {
    return this.modules.reduce((total, module) => {
      const meta = this.moduleMeta.get(module.definition.id);
      return total + (meta?.capacityCost ?? 0);
    }, 0);
  }

  list(): RobotModule[] {
    return [...this.modules];
  }

  getModule(moduleId: string): RobotModule | null {
    return this.modules.find((module) => module.definition.id === moduleId) ?? null;
  }

  getOrderIndex(moduleId: string): number {
    return this.modules.findIndex((module) => module.definition.id === moduleId);
  }

  hasCapability(capability: string): boolean {
    return this.capabilities.has(capability);
  }

  attach(module: RobotModule): ModuleMetadata {
    const { definition } = module;
    if (!definition?.id) {
      throw new Error('Robot modules require a stable id.');
    }
    if (this.moduleMeta.has(definition.id)) {
      throw new Error(`Module ${definition.id} is already attached.`);
    }

    const meta = this.createMeta(definition);

    if (this.capacityUsed + meta.capacityCost > this.capacity) {
      throw new Error(`Module stack capacity exceeded (${this.capacity}).`);
    }

    this.assertDependenciesSatisfied(definition, meta);
    this.assertAttachmentAvailable(meta);

    this.moduleMeta.set(definition.id, meta);
    this.modules.push(module);
    this.sortModules();
    this.rebuildCapabilities();

    return meta;
  }

  detach(moduleId: string): RobotModule | null {
    if (!this.moduleMeta.has(moduleId)) {
      return null;
    }

    const module = this.getModule(moduleId);
    const meta = this.moduleMeta.get(moduleId);
    if (!module || !meta) {
      return null;
    }
    const originalIndex = this.modules.indexOf(module);

    this.modules.splice(originalIndex, 1);
    this.moduleMeta.delete(moduleId);

    try {
      this.assertAllDependenciesSatisfied();
    } catch (error) {
      // Restore original state if dependency check fails.
      this.modules.splice(originalIndex, 0, module);
      this.moduleMeta.set(moduleId, meta);
      throw error;
    }

    this.rebuildCapabilities();
    return module;
  }

  private sortModules(): void {
    this.modules.sort((a, b) => this.compareModules(a.definition.id, b.definition.id));
  }

  private compareModules(aId: string, bId: string): number {
    const a = this.moduleMeta.get(aId);
    const b = this.moduleMeta.get(bId);
    if (!a || !b) {
      return 0;
    }

    const slotComparison = a.slot.localeCompare(b.slot);
    if (slotComparison !== 0) {
      return slotComparison;
    }

    if (a.index !== b.index) {
      return a.index - b.index;
    }

    return aId.localeCompare(bId);
  }

  private createMeta(definition: ResolvedRobotModuleDefinition): ModuleMetadata {
    const slot = definition?.attachment?.slot ?? DEFAULT_SLOT;
    const requestedIndex = definition?.attachment?.index;
    const index = this.allocateIndex(slot, requestedIndex);
    const provides = Array.isArray(definition?.provides) ? [...new Set(definition.provides)] : [];
    const requires = Array.isArray(definition?.requires) ? [...new Set(definition.requires)] : [];
    const capacityCost = ensureNumber(definition?.capacityCost, 1);

    return { slot, index, provides, requires, capacityCost };
  }

  private allocateIndex(slot: string, requestedIndex?: number): number {
    if (Number.isInteger(requestedIndex)) {
      return requestedIndex as number;
    }

    let maxIndex = -1;
    for (const meta of this.moduleMeta.values()) {
      if (meta.slot === slot && meta.index > maxIndex) {
        maxIndex = meta.index;
      }
    }
    return maxIndex + 1;
  }

  private assertAttachmentAvailable(meta: ModuleMetadata): void {
    for (const [moduleId, existing] of this.moduleMeta.entries()) {
      if (existing.slot === meta.slot && existing.index === meta.index) {
        throw new Error(
          `Attachment point ${meta.slot}:${meta.index} already occupied by ${moduleId}.`,
        );
      }
    }
  }

  private assertDependenciesSatisfied(definition: ResolvedRobotModuleDefinition, meta: ModuleMetadata): void {
    const available = new Set(this.capabilities);
    for (const capability of meta.provides) {
      available.add(capability);
    }

    for (const requirement of meta.requires) {
      if (!available.has(requirement)) {
        throw new Error(
          `Module ${definition.id} requires capability ${requirement}, which is not present.`,
        );
      }
    }
  }

  private assertAllDependenciesSatisfied(): void {
    const available = new Set<string>();
    for (const [, meta] of this.moduleMeta.entries()) {
      for (const capability of meta.provides) {
        available.add(capability);
      }
    }

    for (const [moduleId, meta] of this.moduleMeta.entries()) {
      for (const requirement of meta.requires) {
        if (!available.has(requirement)) {
          throw new Error(
            `Detaching would leave module ${moduleId} without required capability ${requirement}.`,
          );
        }
      }
    }
  }

  private rebuildCapabilities(): void {
    this.capabilities.clear();
    for (const meta of this.moduleMeta.values()) {
      for (const capability of meta.provides) {
        this.capabilities.add(capability);
      }
    }
  }

  getSnapshot(): ModuleSnapshot[] {
    return this.modules.map((module) => {
      const meta = this.moduleMeta.get(module.definition.id);
      if (!meta) {
        throw new Error(`No metadata found for module ${module.definition.id}.`);
      }
      return {
        id: module.definition.id,
        title: module.definition.title,
        slot: meta.slot,
        index: meta.index,
        provides: [...meta.provides],
        requires: [...meta.requires],
        capacityCost: meta.capacityCost,
      };
    });
  }
}
