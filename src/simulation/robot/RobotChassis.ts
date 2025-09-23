import { ModuleStack, type ModuleMetadata, type ModuleSnapshot } from './moduleStack';
import { ModuleBus, ModulePort } from './moduleBus';
import { RobotState, type RobotStateSnapshot, type RobotStateOptions, robotStateUtils } from './robotState';
import type { RobotModule } from './RobotModule';
import { InventoryStore } from './inventory';
import { ResourceField, createDefaultResourceNodes } from '../resources/resourceField';
import { type ModuleStateSnapshot, toModuleResourceId, extractModuleInventory, fromModuleResourceId, distanceBetween } from './moduleInventory';
export { EMPTY_MODULE_STATE } from './moduleInventory';
export type { ModuleStateSnapshot, ModuleInventoryEntry, DroppedModuleEntry } from './moduleInventory';
import { createModuleInstance } from './modules/moduleLibrary';

const DEFAULT_CAPACITY = 8;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface RobotChassisOptions {
  capacity?: number;
  state?: RobotStateOptions;
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
  state: RobotState;
}

type ActuatorHandler = (context: ActuatorResolutionContext) => void;

export interface ModuleUpdateContext {
  stepSeconds: number;
  state: RobotStateSnapshot;
  port: ModulePort;
}

export interface ModuleActionContext {
  state: RobotStateSnapshot;
  port: ModulePort;
  requestActuator: (channel: string, args: unknown, priority?: number) => void;
  utilities: {
    robotStateUtils: typeof robotStateUtils;
    inventory: InventoryStore;
    resourceField: ResourceField;
  };
}

export interface ModuleRuntimeContext {
  inventory: InventoryStore;
  resourceField: ResourceField;
}

export type ModuleStoreResult =
  | { success: true; moduleId: string; quantity: number }
  | { success: false; moduleId: string; reason: 'not-found' | 'blocked' | 'inventory-full'; message?: string };

export type ModuleMountResult =
  | { success: true; moduleId: string }
  | { success: false; moduleId: string; reason: 'not-found' | 'blocked'; message?: string };

export type ModuleDropResult =
  | { success: true; moduleId: string; quantity: number; nodeId: string }
  | { success: false; moduleId: string; reason: 'not-available'; message?: string };

export type ModulePickupResult =
  | { success: true; moduleId: string; quantity: number; nodeId: string; remaining: number }
  | {
      success: false;
      moduleId: string;
      nodeId: string;
      reason: 'not-found' | 'out-of-range' | 'inventory-full' | 'invalid';
      message?: string;
      remaining?: number;
    };

type ModuleListener = (snapshot: ModuleStateSnapshot) => void;

export class RobotChassis {
  readonly state: RobotState;
  readonly moduleStack: ModuleStack;
  readonly inventory: InventoryStore;
  readonly resourceField: ResourceField;
  private readonly bus: ModuleBus;
  private readonly actuatorHandlers = new Map<string, ActuatorHandler>();
  private readonly pendingActuators = new Map<string, ActuatorRequest[]>();
  private tickCounter = 0;
  private readonly moduleListeners = new Set<ModuleListener>();
  private moduleInventoryUnsubscribe: (() => void) | null = null;

  constructor({ capacity = DEFAULT_CAPACITY, state = {} }: RobotChassisOptions = {}) {
    this.state = new RobotState(state);
    this.moduleStack = new ModuleStack({ capacity });
    this.bus = new ModuleBus();
    this.inventory = new InventoryStore();
    this.resourceField = new ResourceField(createDefaultResourceNodes());

    this.resourceField.subscribe(() => {
      this.notifyModuleListeners();
    });

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

  getStateSnapshot(): RobotStateSnapshot {
    return this.state.getSnapshot();
  }

  getModuleStackSnapshot(): ModuleSnapshot[] {
    return this.moduleStack.getSnapshot();
  }

  getModuleStateSnapshot(): ModuleStateSnapshot {
    const installed = this.moduleStack.getSnapshot();
    const inventorySnapshot = this.inventory.getSnapshot();
    const inventoryModules = extractModuleInventory(inventorySnapshot);
    const state = this.getStateSnapshot();
    const ground = this.resourceField
      .list()
      .map((node) => {
        const moduleId = fromModuleResourceId(node.type);
        if (!moduleId) {
          return null;
        }
        return {
          nodeId: node.id,
          moduleId,
          quantity: Math.max(Math.round(node.quantity), 0),
          position: { x: node.position.x, y: node.position.y },
          distance: distanceBetween(state.position, node.position),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => a.distance - b.distance || a.nodeId.localeCompare(b.nodeId));

    return {
      installed,
      inventory: inventoryModules,
      ground,
    } satisfies ModuleStateSnapshot;
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

  attachModule(module: RobotModule): ModuleMetadata {
    const meta = this.moduleStack.attach(module);
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
    this.notifyModuleListeners();
    return meta;
  }

  detachModule(moduleId: string): RobotModule | null {
    const module = this.moduleStack.detach(moduleId);
    if (!module) {
      return null;
    }

    module.onDetach?.();
    this.bus.unregisterModule(moduleId);
    this.notifyModuleListeners();
    return module;
  }

  storeModule(moduleId: string): ModuleStoreResult {
    const trimmedId = moduleId.trim().toLowerCase();
    if (!trimmedId) {
      return { success: false, moduleId: trimmedId, reason: 'not-found' };
    }

    let module: RobotModule | null = null;
    try {
      module = this.detachModule(trimmedId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Module detachment blocked.';
      return { success: false, moduleId: trimmedId, reason: 'blocked', message };
    }

    if (!module) {
      return { success: false, moduleId: trimmedId, reason: 'not-found' };
    }

    const resourceId = toModuleResourceId(trimmedId);
    const result = this.inventory.store(resourceId, 1);

    if (result.stored < 1) {
      this.attachModule(module);
      return { success: false, moduleId: trimmedId, reason: 'inventory-full' };
    }

    this.notifyModuleListeners();
    return { success: true, moduleId: trimmedId, quantity: result.total };
  }

  mountModule(moduleId: string): ModuleMountResult {
    const trimmedId = moduleId.trim().toLowerCase();
    if (!trimmedId) {
      return { success: false, moduleId: trimmedId, reason: 'not-found' };
    }
    const resourceId = toModuleResourceId(trimmedId);
    const withdrawn = this.inventory.withdraw(resourceId, 1);
    if (withdrawn.withdrawn < 1) {
      return { success: false, moduleId: trimmedId, reason: 'not-found' };
    }

    try {
      const module = createModuleInstance(trimmedId);
      this.attachModule(module);
      this.notifyModuleListeners();
      return { success: true, moduleId: trimmedId };
    } catch (error) {
      this.inventory.store(resourceId, withdrawn.withdrawn);
      const message = error instanceof Error ? error.message : 'Module attachment failed.';
      return { success: false, moduleId: trimmedId, reason: 'blocked', message };
    }
  }

  dropModule(
    moduleId: string,
    amount = 1,
    { mergeDistance = 32 }: { mergeDistance?: number } = {},
  ): ModuleDropResult {
    const trimmedId = moduleId.trim().toLowerCase();
    if (!trimmedId || amount <= 0) {
      return { success: false, moduleId: trimmedId, reason: 'not-available', message: 'Invalid module request.' };
    }
    const resourceId = toModuleResourceId(trimmedId);
    const withdrawn = this.inventory.withdraw(resourceId, amount);
    if (withdrawn.withdrawn <= 0) {
      return { success: false, moduleId: trimmedId, reason: 'not-available' };
    }

    const state = this.getStateSnapshot();
    const node = this.resourceField.upsertNode({
      type: resourceId,
      position: { ...state.position },
      quantity: withdrawn.withdrawn,
      mergeDistance,
      metadata: {
        moduleId: trimmedId,
        source: 'module-drop',
      },
    });

    this.notifyModuleListeners();
    return { success: true, moduleId: trimmedId, quantity: withdrawn.withdrawn, nodeId: node.id };
  }

  pickUpModule(
    nodeId: string,
    amount = 1,
    { maxDistance = 64 }: { maxDistance?: number } = {},
  ): ModulePickupResult {
    const state = this.getStateSnapshot();
    const harvest = this.resourceField.harvest({
      nodeId,
      origin: { ...state.position },
      amount,
      maxDistance,
    });

    if (harvest.status === 'not-found') {
      return { success: false, moduleId: '', nodeId, reason: 'not-found', message: 'Module pile not found.' };
    }

    const moduleId = fromModuleResourceId(harvest.type ?? '');
    if (!moduleId) {
      if (harvest.harvested > 0) {
        this.resourceField.restore(nodeId, harvest.harvested);
      }
      return {
        success: false,
        moduleId: '',
        nodeId,
        reason: 'invalid',
        message: 'Node does not contain modules.',
        remaining: harvest.remaining,
      };
    }

    if (harvest.status === 'out-of-range') {
      return {
        success: false,
        moduleId,
        nodeId,
        reason: 'out-of-range',
        message: 'Module pile is out of range.',
        remaining: harvest.remaining,
      };
    }

    const requestedAmount = Math.max(amount, 0);
    if (requestedAmount <= 0) {
      return { success: true, moduleId, quantity: 0, nodeId, remaining: harvest.remaining };
    }

    const storeResult = this.inventory.store(toModuleResourceId(moduleId), harvest.harvested);
    const overflow = harvest.harvested - storeResult.stored;
    if (overflow > 0) {
      this.resourceField.restore(nodeId, overflow);
      return {
        success: false,
        moduleId,
        nodeId,
        reason: 'inventory-full',
        message: 'No space in inventory for modules.',
        remaining: this.resourceField.list().find((node) => node.id === nodeId)?.quantity ?? harvest.remaining,
      };
    }

    this.notifyModuleListeners();
    return {
      success: true,
      moduleId,
      quantity: storeResult.stored,
      nodeId,
      remaining: Math.max(harvest.remaining, 0),
    };
  }

  subscribeModules(listener: ModuleListener): () => void {
    if (this.moduleListeners.size === 0) {
      this.moduleInventoryUnsubscribe = this.inventory.subscribe(() => {
        this.notifyModuleListeners();
      });
    }
    this.moduleListeners.add(listener);
    listener(this.getModuleStateSnapshot());
    return () => {
      this.moduleListeners.delete(listener);
      if (this.moduleListeners.size === 0) {
        this.moduleInventoryUnsubscribe?.();
        this.moduleInventoryUnsubscribe = null;
      }
    };
  }

  private notifyModuleListeners(): void {
    if (this.moduleListeners.size === 0) {
      return;
    }
    const snapshot = this.getModuleStateSnapshot();
    for (const listener of this.moduleListeners) {
      listener(snapshot);
    }
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
        robotStateUtils,
        inventory: this.inventory,
        resourceField: this.resourceField,
      },
    };

    return action.handler(payload, context);
  }
}

export const robotChassisUtils = { RobotState, robotStateUtils };
