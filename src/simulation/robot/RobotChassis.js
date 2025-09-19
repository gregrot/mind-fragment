import { ModuleStack } from './moduleStack.js';
import { ModuleBus } from './moduleBus.js';
import { RobotState, robotStateUtils } from './robotState.js';

const DEFAULT_CAPACITY = 6;

const clone = (value) => JSON.parse(JSON.stringify(value));

export class RobotChassis {
  constructor({
    capacity = DEFAULT_CAPACITY,
    state = {},
  } = {}) {
    this.state = new RobotState(state);
    this.moduleStack = new ModuleStack({ capacity });
    this.bus = new ModuleBus();
    this.actuatorHandlers = new Map();
    this.pendingActuators = new Map();
    this.tickCounter = 0;

    this.registerActuatorHandler('movement.linear', ({ request }) => {
      const { x = 0, y = 0 } = request.payload ?? {};
      this.state.setLinearVelocity(x, y);
    });

    this.registerActuatorHandler('movement.angular', ({ request }) => {
      const value = Number.isFinite(request.payload?.value)
        ? request.payload.value
        : 0;
      this.state.setAngularVelocity(value);
    });
  }

  getStateSnapshot() {
    return this.state.getSnapshot();
  }

  getModuleStackSnapshot() {
    return this.moduleStack.getSnapshot();
  }

  getTelemetrySnapshot() {
    return {
      values: this.bus.getValuesSnapshot(),
      actions: this.bus.getActionsSnapshot(),
    };
  }

  registerActuatorHandler(channel, handler) {
    this.actuatorHandlers.set(channel, handler);
  }

  attachModule(module) {
    const meta = this.moduleStack.attach(module);
    const port = this.bus.registerModule(module.definition.id, (moduleId, channel, payload, priority) =>
      this.queueActuatorRequest(moduleId, channel, payload, priority),
    );
    module.onAttach?.(port, this.getStateSnapshot());
    return meta;
  }

  detachModule(moduleId) {
    const module = this.moduleStack.detach(moduleId);
    if (!module) {
      return null;
    }

    module.onDetach?.();
    this.bus.unregisterModule(moduleId);
    return module;
  }

  queueActuatorRequest(moduleId, channel, payload, priority = 0) {
    if (!this.moduleStack.getModule(moduleId)) {
      throw new Error(`Module ${moduleId} is not attached.`);
    }

    const order = this.moduleStack.getOrderIndex(moduleId);
    if (!this.pendingActuators.has(channel)) {
      this.pendingActuators.set(channel, []);
    }
    this.pendingActuators.get(channel).push({
      moduleId,
      payload: clone(payload ?? {}),
      priority: Number.isFinite(priority) ? priority : 0,
      order,
    });
  }

  resolveActuatorRequests() {
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

  tick(stepSeconds) {
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
      });
    }

    this.resolveActuatorRequests();
    this.state.integrate(stepSeconds);
    this.applyPassiveCooling(stepSeconds);
  }

  applyPassiveCooling(stepSeconds) {
    if (this.state.heat.current <= 0) {
      return;
    }
    const dissipation = Math.min(stepSeconds * 5, this.state.heat.current);
    this.state.applyHeat(-dissipation);
  }

  invokeAction(moduleId, actionName, payload = {}) {
    const action = this.bus.getAction(moduleId, actionName);
    if (!action) {
      throw new Error(`Action ${actionName} not found on module ${moduleId}.`);
    }
    const port = this.bus.getPort(moduleId);
    if (!port) {
      throw new Error(`Module ${moduleId} is not attached.`);
    }

    const context = {
      state: this.getStateSnapshot(),
      port,
      requestActuator: (channel, args, priority = 0) =>
        this.queueActuatorRequest(moduleId, channel, args, priority),
      utilities: { robotStateUtils },
    };

    return action.handler(payload, context);
  }
}

export const robotChassisUtils = { RobotState, robotStateUtils };
