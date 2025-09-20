import { ModuleStack, type ModuleMetadata, type ModuleSnapshot } from './moduleStack';
import { ModuleBus, ModulePort } from './moduleBus';
import { RobotState, type RobotStateSnapshot, type RobotStateOptions, robotStateUtils } from './robotState';
import type { RobotModule } from './RobotModule';
import { InventoryStore } from './inventory';
import { ResourceField, createDefaultResourceNodes } from '../resources/resourceField';

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

export class RobotChassis {
  readonly state: RobotState;
  readonly moduleStack: ModuleStack;
  readonly inventory: InventoryStore;
  readonly resourceField: ResourceField;
  private readonly bus: ModuleBus;
  private readonly actuatorHandlers = new Map<string, ActuatorHandler>();
  private readonly pendingActuators = new Map<string, ActuatorRequest[]>();
  private tickCounter = 0;

  constructor({ capacity = DEFAULT_CAPACITY, state = {} }: RobotChassisOptions = {}) {
    this.state = new RobotState(state);
    this.moduleStack = new ModuleStack({ capacity });
    this.bus = new ModuleBus();
    this.inventory = new InventoryStore();
    this.resourceField = new ResourceField(createDefaultResourceNodes());

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
    return meta;
  }

  detachModule(moduleId: string): RobotModule | null {
    const module = this.moduleStack.detach(moduleId);
    if (!module) {
      return null;
    }

    module.onDetach?.();
    this.bus.unregisterModule(moduleId);
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
        robotStateUtils,
        inventory: this.inventory,
        resourceField: this.resourceField,
      },
    };

    return action.handler(payload, context);
  }
}

export const robotChassisUtils = { RobotState, robotStateUtils };
