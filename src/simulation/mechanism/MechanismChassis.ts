import {
  ModuleStack,
  type ModuleMetadata,
  type ModuleSnapshot,
  type ModuleSlotOccupant,
  DEFAULT_SLOT,
} from './moduleStack';
import { ModuleBus, ModulePort } from './moduleBus';
import { MechanismState, type MechanismStateSnapshot, type MechanismStateOptions, mechanismStateUtils } from './mechanismState';
import type { MechanismModule } from './MechanismModule';
import { InventoryStore } from './inventory';
import { ResourceField, createDefaultResourceNodes } from '../resources/resourceField';
import {
  DEFAULT_STORAGE_BOX_ID,
  createDefaultStorageRegistry,
  type StorageRegistry,
  type StorageRegistrySnapshot,
} from '../storage/storageBox';
import type { SlotMetadata, SlotSchema } from '../../types/slots';

const DEFAULT_CAPACITY = 8;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface MechanismChassisOptions {
  capacity?: number;
  state?: MechanismStateOptions;
  slotSchema?: SlotDefinitionInit[];
}

interface ActuatorRequest {
  moduleId: string;
  payload: unknown;
  priority: number;
  order: number;
}

interface ActuatorResolutionContext {
  channel: string;
  request: ActuatorRequest;
  allRequests: ActuatorRequest[];
  state: MechanismState;
}

type ActuatorHandler = (context: ActuatorResolutionContext) => void;

export interface ChassisSnapshot {
  capacity: number;
  slots: SlotSchema[];
}

interface SlotDefinitionInit {
  slot: string;
  index: number;
  metadata?: Partial<SlotMetadata>;
}

interface SlotDefinition {
  id: string;
  slot: string;
  index: number;
  metadata: SlotMetadata;
}

type SlotListener = (snapshot: ChassisSnapshot) => void;

const DEFAULT_CHASSIS_SLOTS: SlotDefinitionInit[] = [
  { slot: 'core', index: 0 },
  { slot: 'extension', index: 0 },
  { slot: 'sensor', index: 0 },
];

const createSlotId = (slot: string, index: number): string => `${slot}-${index}`;

const formatModuleSubtype = (slot: string): string | undefined => {
  if (!slot || slot === DEFAULT_SLOT) {
    return undefined;
  }
  const parts = slot.split(/[-_\s]+/).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
};

export interface ModuleUpdateContext {
  stepSeconds: number;
  state: MechanismStateSnapshot;
  port: ModulePort;
}

export interface ModuleActionContext {
  state: MechanismStateSnapshot;
  port: ModulePort;
  requestActuator: (channel: string, args: unknown, priority?: number) => void;
  utilities: {
    mechanismStateUtils: typeof mechanismStateUtils;
    inventory: InventoryStore;
    resourceField: ResourceField;
    storage: StorageRegistry;
  };
}

export interface ModuleRuntimeContext {
  inventory: InventoryStore;
  resourceField: ResourceField;
}

export class MechanismChassis {
  readonly state: MechanismState;
  readonly moduleStack: ModuleStack;
  readonly inventory: InventoryStore;
  readonly resourceField: ResourceField;
  readonly storage: StorageRegistry;
  private readonly bus: ModuleBus;
  private readonly actuatorHandlers = new Map<string, ActuatorHandler>();
  private readonly pendingActuators = new Map<string, ActuatorRequest[]>();
  private tickCounter = 0;
  private readonly slotDefinitions = new Map<string, SlotDefinition>();
  private readonly slotListeners = new Set<SlotListener>();

  constructor({ capacity = DEFAULT_CAPACITY, state = {}, slotSchema }: MechanismChassisOptions = {}) {
    this.state = new MechanismState(state);
    this.moduleStack = new ModuleStack({ capacity });
    this.bus = new ModuleBus();
    this.inventory = new InventoryStore();
    this.resourceField = new ResourceField(createDefaultResourceNodes());
    this.storage = createDefaultStorageRegistry();

    this.inventory.setSlotConfiguration(0, {
      metadata: { stackable: false, moduleSubtype: 'Tool Bay' },
      occupantId: 'axe',
    });

    const initialSlots = Array.isArray(slotSchema) && slotSchema.length > 0 ? slotSchema : DEFAULT_CHASSIS_SLOTS;
    for (const definition of initialSlots) {
      this.registerSlotDefinition(definition);
    }

    this.registerActuatorHandler('movement.linear', ({ request }) => {
      const payload = request.payload as { x?: number; y?: number } | undefined;
      const { x = 0, y = 0 } = payload ?? {};
      this.state.setLinearVelocity(x, y);
    });

    this.registerActuatorHandler('movement.angular', ({ request }) => {
      const payload = request.payload as { value?: number } | undefined;
      const value = Number.isFinite(payload?.value) ? payload!.value! : 0;
      this.state.setAngularVelocity(value);
    });
  }

  private registerSlotDefinition({ slot, index, metadata }: SlotDefinitionInit): void {
    const id = createSlotId(slot, index);
    if (this.slotDefinitions.has(id)) {
      return;
    }
    const resolvedMetadata = this.createSlotMetadata(slot, metadata);
    this.slotDefinitions.set(id, {
      id,
      slot,
      index,
      metadata: resolvedMetadata,
    });
  }

  private createSlotMetadata(slot: string, overrides?: Partial<SlotMetadata>): SlotMetadata {
    return {
      stackable: overrides?.stackable ?? false,
      locked: overrides?.locked ?? false,
      moduleSubtype: overrides?.moduleSubtype ?? formatModuleSubtype(slot),
    } satisfies SlotMetadata;
  }

  private ensureSlotDefinition(slot: string, index: number): void {
    const id = createSlotId(slot, index);
    if (this.slotDefinitions.has(id)) {
      return;
    }
    this.registerSlotDefinition({ slot, index });
  }

  private getOrderedSlotDefinitions(): SlotDefinition[] {
    return [...this.slotDefinitions.values()].sort((a, b) => {
      const slotComparison = a.slot.localeCompare(b.slot);
      if (slotComparison !== 0) {
        return slotComparison;
      }
      if (a.index !== b.index) {
        return a.index - b.index;
      }
      return a.id.localeCompare(b.id);
    });
  }

  private buildSlotSchema(definition: SlotDefinition, occupant: ModuleSlotOccupant | null): SlotSchema {
    return {
      id: definition.id,
      index: definition.index,
      occupantId: occupant?.moduleId ?? null,
      metadata: { ...definition.metadata },
    } satisfies SlotSchema;
  }

  private notifySlotListeners(): void {
    if (this.slotListeners.size === 0) {
      return;
    }
    const snapshot = this.getSlotSchemaSnapshot();
    for (const listener of this.slotListeners) {
      listener(snapshot);
    }
  }

  getSlotSchemaSnapshot(): ChassisSnapshot {
    const definitions = this.getOrderedSlotDefinitions();
    const slots: SlotSchema[] = definitions.map((definition) => {
      const occupant = this.moduleStack.getSlotOccupant(definition.slot, definition.index);
      return this.buildSlotSchema(definition, occupant);
    });
    return { capacity: this.moduleStack.capacity, slots } satisfies ChassisSnapshot;
  }

  subscribeSlots(listener: SlotListener): () => void {
    this.slotListeners.add(listener);
    listener(this.getSlotSchemaSnapshot());
    return () => {
      this.slotListeners.delete(listener);
    };
  }

  getStateSnapshot(): MechanismStateSnapshot {
    return this.state.getSnapshot();
  }

  getModuleStackSnapshot(): ModuleSnapshot[] {
    return this.moduleStack.getSnapshot();
  }

  getTelemetrySnapshot(): { values: ReturnType<ModuleBus['getValuesSnapshot']>; actions: ReturnType<ModuleBus['getActionsSnapshot']> } {
    return {
      values: this.bus.getValuesSnapshot(),
      actions: this.bus.getActionsSnapshot(),
    };
  }

  getInventorySnapshot(): ReturnType<InventoryStore['getSnapshot']> {
    return this.inventory.getSnapshot();
  }

  registerActuatorHandler(channel: string, handler: ActuatorHandler): void {
    this.actuatorHandlers.set(channel, handler);
  }

  attachModule(module: MechanismModule): ModuleMetadata {
    const meta = this.moduleStack.attach(module);
    this.ensureSlotDefinition(meta.slot, meta.index);
    const port = this.bus.registerModule(module.definition.id, (moduleId, channel, payload, priority) =>
      this.queueActuatorRequest(moduleId, channel, payload, priority),
    );
    module.onAttach?.(
      port,
      this.getStateSnapshot(),
      {
        inventory: this.inventory,
        resourceField: this.resourceField,
      } as ModuleRuntimeContext,
    );
    this.notifySlotListeners();
    return meta;
  }

  detachModule(moduleId: string): MechanismModule | null {
    const module = this.moduleStack.detach(moduleId);
    if (!module) {
      return null;
    }

    module.onDetach?.();
    this.bus.unregisterModule(moduleId);
    this.notifySlotListeners();
    return module;
  }

  queueActuatorRequest(moduleId: string, channel: string, payload: unknown, priority = 0): void {
    if (!this.moduleStack.getModule(moduleId)) {
      throw new Error(`Module ${moduleId} is not attached.`);
    }

    const order = this.moduleStack.getOrderIndex(moduleId);
    if (!this.pendingActuators.has(channel)) {
      this.pendingActuators.set(channel, []);
    }
    this.pendingActuators.get(channel)!.push({
      moduleId,
      payload: clone(payload ?? {}),
      priority: Number.isFinite(priority) ? (priority as number) : 0,
      order,
    });
  }

  private resolveActuatorRequests(): void {
    for (const [channel, requests] of this.pendingActuators.entries()) {
      if (requests.length === 0) {
        continue;
      }
      const handler = this.actuatorHandlers.get(channel);
      if (!handler) {
        continue;
      }
      requests.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return a.moduleId.localeCompare(b.moduleId);
      });
      handler({
        channel,
        request: requests[0],
        allRequests: requests,
        state: this.state,
      });
    }
    this.pendingActuators.clear();
  }

  tick(stepSeconds: number): void {
    this.tickCounter += 1;
    const modules = this.moduleStack.list();
    for (const module of modules) {
      const port = this.bus.getPort(module.definition.id);
      if (!port) {
        continue;
      }
      module.update?.({
        stepSeconds,
        state: this.getStateSnapshot(),
        port,
      } satisfies ModuleUpdateContext);
    }

    this.resolveActuatorRequests();
    this.state.integrate(stepSeconds);
    this.applyPassiveCooling(stepSeconds);
  }

  private applyPassiveCooling(stepSeconds: number): void {
    const snapshot = this.state.getSnapshot();
    if (snapshot.heat.current <= 0) {
      return;
    }
    const dissipation = Math.min(stepSeconds * 5, snapshot.heat.current);
    this.state.applyHeat(-dissipation);
  }

  invokeAction(moduleId: string, actionName: string, payload: unknown = {}): unknown {
    const action = this.bus.getAction(moduleId, actionName);
    if (!action) {
      throw new Error(`Action ${actionName} not found on module ${moduleId}.`);
    }
    const port = this.bus.getPort(moduleId);
    if (!port) {
      throw new Error(`Module ${moduleId} is not attached.`);
    }

    const context: ModuleActionContext = {
      state: this.getStateSnapshot(),
      port,
      requestActuator: (channel, args, priority = 0) =>
        this.queueActuatorRequest(moduleId, channel, args, priority),
      utilities: {
        mechanismStateUtils,
        inventory: this.inventory,
        resourceField: this.resourceField,
        storage: this.storage,
      },
    };

    return action.handler(payload, context);
  }

  getStorageSnapshot(): StorageRegistrySnapshot {
    return this.storage.getSnapshot();
  }

  clearStorage(boxId: string = DEFAULT_STORAGE_BOX_ID): void {
    this.storage.clear(boxId);
  }
}

export const mechanismChassisUtils = { MechanismState, mechanismStateUtils };
