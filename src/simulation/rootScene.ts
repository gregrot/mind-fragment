import { Application, Container, Graphics, Ticker } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { assetService } from './assetService';
import type { CompiledProgram } from './runtime/blockProgram';
import { type ProgramDebugState, type ProgramRunnerStatus } from './runtime/blockProgramRunner';
import {
  SIMULATION_BLACKBOARD_EVENT_KEYS,
  SIMULATION_BLACKBOARD_FACT_KEYS,
  type SimulationTelemetrySnapshot,
} from './runtime/ecsBlackboard';
import { createSimulationWorld, DEFAULT_MECHANISM_ID, type SimulationWorldContext } from './runtime/simulationWorld';
import type { EntityId } from './ecs/world';
import type { InventorySnapshot } from './mechanism/inventory';
import { InventoryStore } from './mechanism/inventory';
import { MechanismChassis, type MechanismModule, type ChassisSnapshot, createModuleInstance } from './mechanism';
import type { SlotSchema } from '../types/slots';
import type { ResourceNode, UpsertNodeOptions } from './resources/resourceField';

interface TickPayload {
  deltaMS: number;
}

const STEP_MS = 1000 / 60;
const GRID_EXTENT = 2000;
const GRID_SPACING = 80;
type MechanismSelectionListener = (mechanismId: string | null, entityId: EntityId | null) => void;
type TelemetryListener = (
  snapshot: SimulationTelemetrySnapshot,
  mechanismId: string | null,
) => void;
type ChassisListener = (snapshot: ChassisSnapshot) => void;

const EMPTY_TELEMETRY_SNAPSHOT: SimulationTelemetrySnapshot = {
  values: {},
  actions: {},
};

const EMPTY_CHASSIS_SNAPSHOT: ChassisSnapshot = {
  capacity: 0,
  slots: [],
};

const EMPTY_PROGRAM_DEBUG_STATE: ProgramDebugState = {
  status: 'idle',
  program: null,
  currentInstruction: null,
  timeRemaining: 0,
  frames: [],
};

export interface MechanismOverlayChassisUpdate {
  capacity: number;
  slots: SlotSchema[];
}

export interface MechanismOverlayInventoryUpdate {
  capacity: number;
  slots: SlotSchema[];
}

export interface MechanismOverlayUpdate {
  chassis?: MechanismOverlayChassisUpdate;
  inventory?: MechanismOverlayInventoryUpdate;
}

const sortSlots = <T extends { index: number }>(slots: T[]): T[] => {
  return [...slots].sort((a, b) => a.index - b.index);
};

const reconcileChassisFromOverlay = (
  mechanism: MechanismChassis,
  update: MechanismOverlayChassisUpdate,
): void => {
  const targetSlots = sortSlots(update.slots ?? []);
  if (targetSlots.length === 0) {
    return;
  }

  const actualSnapshot = mechanism.getSlotSchemaSnapshot();
  const targetSlotsById = new Map(targetSlots.map((slot) => [slot.id, slot]));
  const detachedModules = new Map<string, MechanismModule>();
  const attachedModuleIds = new Set(mechanism.moduleStack.list().map((module) => module.definition.id));

  const detach = (moduleId: string): void => {
    const module = mechanism.detachModule(moduleId);
    if (module) {
      detachedModules.set(moduleId, module);
      attachedModuleIds.delete(moduleId);
    }
  };

  for (const actualSlot of actualSnapshot.slots) {
    const targetSlot = targetSlotsById.get(actualSlot.id);
    if (actualSlot.metadata.locked) {
      continue;
    }
    const expectedOccupant = targetSlot?.occupantId ?? null;
    if (actualSlot.occupantId && actualSlot.occupantId !== expectedOccupant) {
      detach(actualSlot.occupantId);
    }
  }

  for (const targetSlot of targetSlots) {
    const occupantId = targetSlot.occupantId;
    if (!occupantId || attachedModuleIds.has(occupantId)) {
      continue;
    }
    const reserved = detachedModules.get(occupantId) ?? createModuleInstance(occupantId);
    try {
      mechanism.attachModule(reserved);
      attachedModuleIds.add(occupantId);
      detachedModules.delete(occupantId);
    } catch (error) {
      console.warn(`Failed to attach module ${occupantId} during overlay reconciliation.`, error);
    }
  }

};

const ensureInventoryCapacity = (inventory: InventoryStore, capacity: number): void => {
  if (capacity <= 0) {
    return;
  }
  const current = inventory.getSlotSchemaSnapshot().capacity;
  if (capacity > current) {
    inventory.configureSlotCapacity(capacity);
  }
};

const ensureInventorySlotMetadata = (inventory: InventoryStore, slot: SlotSchema): void => {
  const existing = inventory.getSlot(slot.id);
  if (
    !existing ||
    existing.metadata.locked !== slot.metadata.locked ||
    existing.metadata.stackable !== slot.metadata.stackable ||
    existing.metadata.moduleSubtype !== slot.metadata.moduleSubtype
  ) {
    inventory.setSlotMetadata(slot.id, slot.metadata);
  }
};

const ensureInventorySlotOccupant = (inventory: InventoryStore, slot: SlotSchema): void => {
  const desiredId = slot.occupantId;
  if (!desiredId) {
    return;
  }

  const desiredCount = Math.max(slot.stackCount ?? 1, 1);
  const currentSlot = inventory.getSlot(slot.id);
  if (currentSlot?.occupantId === desiredId) {
    const currentCount = Math.max(currentSlot.stackCount ?? 1, 1);
    if (currentCount > desiredCount) {
      inventory.withdraw(desiredId, currentCount - desiredCount);
    } else if (currentCount < desiredCount) {
      inventory.store(desiredId, desiredCount - currentCount);
    }
    return;
  }

  const snapshot = inventory.getSlotSchemaSnapshot();
  const donor = snapshot.slots.find((candidate) => candidate.occupantId === desiredId);
  if (donor && !donor.metadata.locked && !slot.metadata.locked) {
    inventory.transferSlotItem(donor.id, slot.id);
    const updatedSlot = inventory.getSlot(slot.id);
    const updatedCount = Math.max(updatedSlot?.stackCount ?? 1, 1);
    if (updatedCount > desiredCount) {
      inventory.withdraw(desiredId, updatedCount - desiredCount);
    } else if (updatedCount < desiredCount) {
      inventory.store(desiredId, desiredCount - updatedCount);
    }
    return;
  }

  inventory.store(desiredId, desiredCount);
  const afterStoreSnapshot = inventory.getSlotSchemaSnapshot();
  const stored = afterStoreSnapshot.slots.find((candidate) => candidate.occupantId === desiredId);
  if (stored && stored.id !== slot.id && !stored.metadata.locked && !slot.metadata.locked) {
    inventory.transferSlotItem(stored.id, slot.id);
  }
};

const clearInventorySlot = (inventory: InventoryStore, slot: SlotSchema): void => {
  if (slot.metadata.locked) {
    return;
  }
  const current = inventory.getSlot(slot.id);
  if (!current?.occupantId) {
    return;
  }
  const amount = Math.max(current.stackCount ?? 1, 1);
  inventory.withdraw(current.occupantId, amount);
};

const reconcileInventoryFromOverlay = (
  inventory: InventoryStore,
  update: MechanismOverlayInventoryUpdate,
): void => {
  const targetSlots = sortSlots(update.slots ?? []);
  if (targetSlots.length === 0) {
    return;
  }

  ensureInventoryCapacity(inventory, Math.max(update.capacity, targetSlots.length));

  for (const slot of targetSlots) {
    ensureInventorySlotMetadata(inventory, slot);
  }

  for (const slot of targetSlots) {
    if (slot.occupantId) {
      ensureInventorySlotOccupant(inventory, slot);
    }
  }

  for (const slot of targetSlots) {
    if (!slot.occupantId) {
      clearInventorySlot(inventory, slot);
    }
  }
};

export const reconcileMechanismOverlayState = (
  mechanism: MechanismChassis,
  overlay: MechanismOverlayUpdate,
): void => {
  if (overlay.chassis) {
    reconcileChassisFromOverlay(mechanism, overlay.chassis);
  }
  if (overlay.inventory) {
    reconcileInventoryFromOverlay(mechanism.inventory, overlay.inventory);
  }
};

export class RootScene {
  private readonly app: Application;
  private readonly viewport: Viewport;
  private readonly backgroundLayer: Container;
  private readonly rootLayer: Container;
  private context: SimulationWorldContext | null;
  private readonly pendingContextCallbacks: Array<{ callback: (context: SimulationWorldContext) => void }>;
  private hasPlayerPanned: boolean;
  private accumulator: number;
  private readonly tickHandler: (payload: TickPayload) => void;
  private readonly programStatusByMechanism: Map<string, ProgramRunnerStatus>;
  private programStatus: ProgramRunnerStatus;
  private readonly programListeners: Set<(status: ProgramRunnerStatus, mechanismId: string) => void>;
  private readonly programDebugListeners: Set<(state: ProgramDebugState, mechanismId: string) => void>;
  private readonly selectionListeners: Set<MechanismSelectionListener>;
  private pendingSelection: string | null;
  private readonly telemetryListeners: Set<TelemetryListener>;
  private telemetrySnapshot: SimulationTelemetrySnapshot;
  private telemetryMechanismId: string | null;
  private readonly telemetrySnapshotsByMechanism: Map<
    string,
    { snapshot: SimulationTelemetrySnapshot; signature: string }
  >;
  private defaultMechanismId: string;
  private readonly programDebugStateByMechanism: Map<string, ProgramDebugState>;
  private programDebugState: ProgramDebugState;

  constructor(app: Application) {
    this.app = app;
    this.accumulator = 0;

    this.viewport = new Viewport({
      screenWidth: app.renderer.width,
      screenHeight: app.renderer.height,
      events: app.renderer.events,
      disableOnContextMenu: true,
    });

    this.viewport
      .drag({ clampWheel: true })
      .wheel({ percent: 0.1 })
      .pinch()
      .decelerate({ friction: 0.85 });

    app.stage.addChild(this.viewport);

    this.hasPlayerPanned = false;
    this.viewport.on('moved', (event: { type: string }) => {
      if (this.hasPlayerPanned) {
        return;
      }
      if (event.type === 'drag' || event.type === 'pinch' || event.type === 'decelerate') {
        this.hasPlayerPanned = true;
      }
    });

    this.viewport.moveCenter(0, 0);

    this.backgroundLayer = this.createGridLayer();
    this.viewport.addChild(this.backgroundLayer);

    this.rootLayer = new Container();
    this.rootLayer.sortableChildren = true;
    this.viewport.addChild(this.rootLayer);

    this.context = null;
    this.pendingContextCallbacks = [];
    this.tickHandler = this.tick.bind(this);
    app.ticker.add(this.tickHandler as (ticker: Ticker) => void);

    this.programStatusByMechanism = new Map();
    this.programListeners = new Set();
    this.programDebugListeners = new Set();
    this.selectionListeners = new Set();
    this.pendingSelection = null;
    this.defaultMechanismId = DEFAULT_MECHANISM_ID;
    this.programStatus = 'idle';
    this.telemetryListeners = new Set();
    this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
    this.telemetryMechanismId = null;
    this.telemetrySnapshotsByMechanism = new Map();
    this.programDebugStateByMechanism = new Map();
    this.programDebugState = EMPTY_PROGRAM_DEBUG_STATE;

    void this.initialiseSimulationWorld();
  }

  private async initialiseSimulationWorld(): Promise<void> {
    const context = await createSimulationWorld({
      renderer: this.app.renderer,
      onMechanismSelected: (mechanismId) => this.notifyMechanismSelected(mechanismId),
      overlayLayer: this.rootLayer,
      viewport: this.viewport,
    });

    this.context = context;
    this.defaultMechanismId = context.defaultMechanismId ?? DEFAULT_MECHANISM_ID;

    context.world.runSystems(0);

    this.telemetrySnapshotsByMechanism.clear();
    this.programStatusByMechanism.clear();
    this.programDebugStateByMechanism.clear();
    this.programDebugState = EMPTY_PROGRAM_DEBUG_STATE;

    for (const mechanismId of context.entities.mechanisms.keys()) {
      const sprite = context.getSprite(mechanismId);
      if (sprite && sprite.parent !== this.rootLayer) {
        this.rootLayer.addChild(sprite);
      }

      const transform = context.getTransform(mechanismId);
      if (transform && sprite) {
        sprite.position.set(transform.position.x, transform.position.y);
        sprite.rotation = transform.rotation;
      }

      const programRunner = context.getProgramRunner(mechanismId);
      if (programRunner) {
        programRunner.setStatusListener((status) => this.handleProgramStatus(mechanismId, status));
        programRunner.setDebugStateListener((state) => this.handleProgramDebug(mechanismId, state));
        this.programStatusByMechanism.set(mechanismId, programRunner.getStatus());
      } else {
        this.programStatusByMechanism.set(mechanismId, 'idle');
        this.programDebugStateByMechanism.set(mechanismId, EMPTY_PROGRAM_DEBUG_STATE);
      }
    }

    const targetSelection =
      this.pendingSelection ?? context.getSelectedMechanism() ?? this.defaultMechanismId ?? DEFAULT_MECHANISM_ID;
    if (context.getSelectedMechanism() !== targetSelection) {
      context.selectMechanism(targetSelection);
    }
    this.pendingSelection = targetSelection;
    this.updateProgramStatusForSelection();
    this.updateProgramDebugForSelection();

    this.flushPendingContextCallbacks(context);

    if (!this.hasPlayerPanned) {
      const focusMechanismId = this.getActiveMechanismId(context);
      const focusSprite = context.getSprite(focusMechanismId);
      if (focusSprite) {
        this.viewport.moveCenter(focusSprite.position.x, focusSprite.position.y);
      }
    }

    this.captureTelemetrySnapshot(true);

    // Presentation systems are responsible for updating overlay components.
  }

  private flushPendingContextCallbacks(context: SimulationWorldContext): void {
    const callbacks = [...this.pendingContextCallbacks];
    this.pendingContextCallbacks.length = 0;
    for (const entry of callbacks) {
      entry.callback(context);
    }
  }

  private onContextReady(callback: (context: SimulationWorldContext) => void): () => void {
    if (this.context) {
      callback(this.context);
      return () => {};
    }
    const entry = { callback } as const;
    this.pendingContextCallbacks.push(entry);
    return () => {
      const index = this.pendingContextCallbacks.indexOf(entry);
      if (index >= 0) {
        this.pendingContextCallbacks.splice(index, 1);
      }
    };
  }

  private createGridLayer(): Container {
    const layer = new Container();

    const grid = new Graphics();
    grid.setStrokeStyle({ width: 1, color: 0x2c3e50, alpha: 0.35 });
    for (let x = -GRID_EXTENT; x <= GRID_EXTENT; x += GRID_SPACING) {
      grid.moveTo(x, -GRID_EXTENT);
      grid.lineTo(x, GRID_EXTENT);
    }
    for (let y = -GRID_EXTENT; y <= GRID_EXTENT; y += GRID_SPACING) {
      grid.moveTo(-GRID_EXTENT, y);
      grid.lineTo(GRID_EXTENT, y);
    }
    grid.stroke();

    const axes = new Graphics();
    axes.setStrokeStyle({ width: 2, color: 0xff6b6b, alpha: 0.75 });
    axes.moveTo(-GRID_EXTENT, 0);
    axes.lineTo(GRID_EXTENT, 0);
    axes.moveTo(0, -GRID_EXTENT);
    axes.lineTo(0, GRID_EXTENT);
    axes.stroke();

    layer.addChild(grid);
    layer.addChild(axes);

    return layer;
  }

  private tick({ deltaMS }: TickPayload): void {
    this.accumulator += deltaMS;

    while (this.accumulator >= STEP_MS) {
      this.step(STEP_MS);
      this.accumulator -= STEP_MS;
    }
  }

  private step(stepMs: number): void {
    const stepSeconds = stepMs / 1000;
    this.viewport.update(stepSeconds * 60);

    const context = this.context;
    context?.world.runSystems(stepSeconds);

    this.captureTelemetrySnapshot();

  }

  resize(width: number, height: number): void {
    this.viewport.resize(width, height, width, height);

    if (!this.hasPlayerPanned) {
      const context = this.context;
      const mechanismId = this.getActiveMechanismId(context);
      const sprite = context?.getSprite(mechanismId);
      const targetX = sprite?.position.x ?? 0;
      const targetY = sprite?.position.y ?? 0;
      this.viewport.moveCenter(targetX, targetY);
    }
  }

  runProgram(mechanismId: string, program: CompiledProgram): void {
    const execute = (context: SimulationWorldContext) => {
      context.getProgramRunner(mechanismId)?.load(program);
    };
    if (this.context) {
      execute(this.context);
      return;
    }
    this.onContextReady(execute);
  }

  stopProgram(mechanismId: string): void {
    const execute = (context: SimulationWorldContext) => {
      context.getProgramRunner(mechanismId)?.stop();
    };
    if (this.context) {
      execute(this.context);
      return;
    }
    this.onContextReady(execute);
  }

  getProgramStatus(mechanismId: string = this.getActiveMechanismId()): ProgramRunnerStatus {
    return this.programStatusByMechanism.get(mechanismId) ?? 'idle';
  }

  getProgramDebugState(mechanismId: string = this.getActiveMechanismId()): ProgramDebugState {
    return this.programDebugStateByMechanism.get(mechanismId) ?? this.programDebugState;
  }

  getInventorySnapshot(mechanismId: string = this.getActiveMechanismId()): InventorySnapshot {
    const mechanismCore = this.context?.getMechanismCore(mechanismId);
    if (!mechanismCore) {
      return { capacity: 0, used: 0, available: 0, entries: [], slots: [], slotCapacity: 0, equipment: [] };
    }
    return mechanismCore.getInventorySnapshot();
  }

  getChassisSnapshot(mechanismId: string = this.getActiveMechanismId()): ChassisSnapshot {
    const mechanismCore = this.context?.getMechanismCore(mechanismId);
    if (!mechanismCore) {
      return EMPTY_CHASSIS_SNAPSHOT;
    }
    return mechanismCore.getSlotSchemaSnapshot();
  }

  getResourceFieldSnapshot(mechanismId: string = this.getActiveMechanismId()): ResourceNode[] {
    const context = this.context;
    if (!context) {
      return [];
    }
    const targetId = mechanismId ?? this.getActiveMechanismId(context);
    const mechanismCore = context.getMechanismCore(targetId);
    if (!mechanismCore) {
      return [];
    }
    return mechanismCore.resourceField.list();
  }

  upsertResourceNode(
    mechanismId: string | null | undefined,
    node: UpsertNodeOptions,
  ): Promise<ResourceNode | null> {
    const execute = (context: SimulationWorldContext): ResourceNode | null => {
      const targetId = mechanismId ?? this.getActiveMechanismId(context);
      const mechanismCore = context.getMechanismCore(targetId);
      if (!mechanismCore) {
        return null;
      }
      return mechanismCore.resourceField.upsertNode(node);
    };

    if (this.context) {
      return Promise.resolve(execute(this.context));
    }

    return new Promise((resolve) => {
      this.onContextReady((context) => {
        resolve(execute(context));
      });
    });
  }

  removeResourceNode(
    mechanismId: string | null | undefined,
    nodeId: string,
  ): Promise<boolean> {
    const execute = (context: SimulationWorldContext): boolean => {
      const targetId = mechanismId ?? this.getActiveMechanismId(context);
      const mechanismCore = context.getMechanismCore(targetId);
      if (!mechanismCore) {
        return false;
      }
      return mechanismCore.resourceField.removeNode(nodeId);
    };

    if (this.context) {
      return Promise.resolve(execute(this.context));
    }

    return new Promise((resolve) => {
      this.onContextReady((context) => {
        resolve(execute(context));
      });
    });
  }

  subscribeInventory(listener: (snapshot: InventorySnapshot) => void): () => void {
    listener(this.getInventorySnapshot());

    let unsubscribed = false;
    let teardown: (() => void) | null = null;

    const cancelReady = this.onContextReady((context) => {
      if (unsubscribed) {
        return;
      }
      const mechanismId = this.getActiveMechanismId(context);
      const mechanismCore = context.getMechanismCore(mechanismId);
      if (!mechanismCore) {
        return;
      }
      teardown = mechanismCore.inventory.subscribe(listener);
    });

    return () => {
      unsubscribed = true;
      cancelReady();
      teardown?.();
      teardown = null;
    };
  }

  subscribeChassis(listener: ChassisListener): () => void {
    listener(this.getChassisSnapshot());

    let unsubscribed = false;
    let teardown: (() => void) | null = null;
    let selectionUnsubscribe: (() => void) | null = null;

    const cancelReady = this.onContextReady((context) => {
      if (unsubscribed) {
        return;
      }

      const attach = (mechanismId: string | null) => {
        if (unsubscribed) {
          return;
        }
        const targetId = mechanismId ?? this.getActiveMechanismId(context);
        const mechanismCore = context.getMechanismCore(targetId);
        if (!mechanismCore) {
          return;
        }
        teardown?.();
        teardown = mechanismCore.subscribeSlots(listener);
      };

      selectionUnsubscribe = this.subscribeMechanismSelection((mechanismId) => {
        attach(mechanismId);
      });

      attach(this.pendingSelection);
    });

    return () => {
      unsubscribed = true;
      cancelReady();
      selectionUnsubscribe?.();
      selectionUnsubscribe = null;
      teardown?.();
      teardown = null;
    };
  }

  reconcileMechanismOverlay(mechanismId: string, overlay: MechanismOverlayUpdate): void {
    const targetId = mechanismId ?? this.getActiveMechanismId();
    this.onContextReady((context) => {
      const mechanismCore = context.getMechanismCore(targetId);
      if (!mechanismCore) {
        return;
      }
      reconcileMechanismOverlayState(mechanismCore, overlay);
    });
  }

  subscribeProgramStatus(listener: (status: ProgramRunnerStatus, mechanismId: string) => void): () => void {
    this.programListeners.add(listener);
    for (const [mechanismId, status] of this.programStatusByMechanism) {
      listener(status, mechanismId);
    }
    if (this.programStatusByMechanism.size === 0) {
      listener(this.programStatus, this.getActiveMechanismId());
    }
    return () => {
      this.programListeners.delete(listener);
    };
  }

  subscribeProgramDebug(listener: (state: ProgramDebugState, mechanismId: string) => void): () => void {
    this.programDebugListeners.add(listener);
    if (this.programDebugStateByMechanism.size > 0) {
      for (const [mechanismId, state] of this.programDebugStateByMechanism) {
        listener(state, mechanismId);
      }
    } else {
      listener(this.programDebugState, this.getActiveMechanismId());
    }
    return () => {
      this.programDebugListeners.delete(listener);
    };
  }

  subscribeMechanismSelection(listener: MechanismSelectionListener): () => void {
    this.selectionListeners.add(listener);
    const entity =
      this.pendingSelection && this.context
        ? this.context.getMechanismEntity(this.pendingSelection) ?? null
        : null;
    const entityId = entity ? (entity.id as EntityId) : null;
    listener(this.pendingSelection, entityId);
    return () => {
      this.selectionListeners.delete(listener);
    };
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);
    if (this.telemetrySnapshotsByMechanism.size > 0) {
      for (const [mechanismId, entry] of this.telemetrySnapshotsByMechanism) {
        listener(entry.snapshot, mechanismId);
      }
    } else {
      listener(this.telemetrySnapshot, this.telemetryMechanismId);
    }
    return () => {
      this.telemetryListeners.delete(listener);
    };
  }

  selectMechanism(mechanismId: string): void {
    this.notifyMechanismSelected(mechanismId);
  }

  clearMechanismSelection(): void {
    this.notifyMechanismSelected(null);
  }

  getSelectedMechanism(): string | null {
    return this.pendingSelection;
  }

  getTelemetrySnapshot(mechanismId: string = this.getActiveMechanismId()): SimulationTelemetrySnapshot {
    if (!this.context) {
      const cached = this.telemetrySnapshotsByMechanism.get(mechanismId);
      if (cached) {
        return cached.snapshot;
      }
      if (this.telemetryMechanismId === mechanismId) {
        return this.telemetrySnapshot;
      }
      return EMPTY_TELEMETRY_SNAPSHOT;
    }
    this.captureTelemetrySnapshot();
    const entry = this.telemetrySnapshotsByMechanism.get(mechanismId);
    if (entry) {
      return entry.snapshot;
    }
    if (this.telemetryMechanismId === mechanismId) {
      return this.telemetrySnapshot;
    }
    return EMPTY_TELEMETRY_SNAPSHOT;
  }

  destroy(): void {
    this.app.ticker.remove(this.tickHandler as (ticker: Ticker) => void);
    this.programListeners.clear();
    this.programStatusByMechanism.clear();
    this.programStatus = 'idle';
    this.programDebugListeners.clear();
    this.programDebugStateByMechanism.clear();
    this.programDebugState = EMPTY_PROGRAM_DEBUG_STATE;
    this.notifyMechanismSelected(null);
    this.selectionListeners.clear();
    this.telemetryListeners.clear();
    this.telemetrySnapshotsByMechanism.clear();
    this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
    this.telemetryMechanismId = null;
    this.pendingContextCallbacks.length = 0;
    this.defaultMechanismId = DEFAULT_MECHANISM_ID;
    const context = this.context;
    if (context) {
      for (const mechanismId of context.entities.mechanisms.keys()) {
        context.getProgramRunner(mechanismId)?.stop();

        const mechanismCore = context.getMechanismCore(mechanismId);
        if (mechanismCore) {
          const modules = [...mechanismCore.moduleStack.list()].reverse();
          for (const module of modules) {
            mechanismCore.detachModule(module.definition.id);
          }
        }

        const sprite = context.getSprite(mechanismId);
        sprite?.destroy({ children: true });

        const entity = context.entities.mechanisms.get(mechanismId);
        if (entity !== undefined) {
          context.world.destroyEntity(entity);
        }
      }
      context.world.destroyEntity(context.entities.selection);
      context.world.runSystems(0);
      context.blackboard.clear();
      this.context = null;
    }
    this.viewport.destroy({ children: true, texture: false });
    assetService.disposeAll();
  }

  private handleProgramStatus(mechanismId: string, status: ProgramRunnerStatus): void {
    this.programStatusByMechanism.set(mechanismId, status);
    if (this.getActiveMechanismId() === mechanismId) {
      this.applyProgramStatusForActiveMechanism(mechanismId, status);
    }
    for (const listener of this.programListeners) {
      listener(status, mechanismId);
    }
  }

  private handleProgramDebug(mechanismId: string, state: ProgramDebugState): void {
    this.programDebugStateByMechanism.set(mechanismId, state);
    if (this.getActiveMechanismId() === mechanismId) {
      this.applyProgramDebugForActiveMechanism(state);
    }
    for (const listener of this.programDebugListeners) {
      listener(state, mechanismId);
    }
  }

  private updateProgramStatusForSelection(): void {
    const activeMechanismId = this.getActiveMechanismId();
    const status = this.programStatusByMechanism.get(activeMechanismId) ?? 'idle';
    this.applyProgramStatusForActiveMechanism(activeMechanismId, status);
  }

  private updateProgramDebugForSelection(): void {
    const activeMechanismId = this.getActiveMechanismId();
    const state = this.programDebugStateByMechanism.get(activeMechanismId);
    if (state) {
      this.applyProgramDebugForActiveMechanism(state);
      return;
    }
    this.applyProgramDebugForActiveMechanism(EMPTY_PROGRAM_DEBUG_STATE);
  }

  private applyProgramStatusForActiveMechanism(mechanismId: string, status: ProgramRunnerStatus): void {
    const previousStatus = this.programStatus;
    this.programStatus = status;
    const blackboard = this.context?.blackboard;
    if (blackboard) {
      blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus, status);
      if (previousStatus !== status) {
        blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.ProgramStatusChanged, status);
      }
    }
  }

  private applyProgramDebugForActiveMechanism(state: ProgramDebugState): void {
    this.programDebugState = state;
  }

  private notifyMechanismSelected(mechanismId: string | null): void {
    if (this.pendingSelection === mechanismId) {
      return;
    }
    this.pendingSelection = mechanismId;
    if (this.context) {
      const current = this.context.getSelectedMechanism();
      if (current !== mechanismId) {
        this.context.selectMechanism(mechanismId);
      }
      if (!this.hasPlayerPanned && mechanismId) {
        const sprite = this.context.getSprite(mechanismId);
        if (sprite) {
          this.viewport.moveCenter(sprite.position.x, sprite.position.y);
        }
      }
    }
    const entity =
      mechanismId && this.context ? this.context.getMechanismEntity(mechanismId) ?? null : null;
    const entityId = entity ? (entity.id as EntityId) : null;
    for (const listener of this.selectionListeners) {
      listener(mechanismId, entityId);
    }
    this.updateProgramStatusForSelection();
    this.captureTelemetrySnapshot(true);
    this.updateProgramDebugForSelection();
  }

  private getActiveMechanismId(context: SimulationWorldContext | null = this.context): string {
    const fallback = context?.defaultMechanismId ?? this.defaultMechanismId ?? DEFAULT_MECHANISM_ID;
    const selected = this.pendingSelection ?? context?.getSelectedMechanism() ?? fallback;
    if (!context) {
      return selected ?? fallback;
    }
    if (selected && context.entities.mechanisms.has(selected)) {
      return selected;
    }
    const iterator = context.entities.mechanisms.keys();
    const next = iterator.next();
    if (!next.done) {
      return next.value;
    }
    return fallback;
  }

  private captureTelemetrySnapshot(force = false): void {
    const context = this.context;
    if (!context) {
      if (force && (this.telemetrySnapshotsByMechanism.size > 0 || this.telemetryMechanismId !== null)) {
        this.telemetrySnapshotsByMechanism.clear();
        this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
        this.telemetryMechanismId = null;
        this.notifyTelemetryListeners(null, this.telemetrySnapshot);
      }
      return;
    }

    const activeMechanismId = this.getActiveMechanismId(context);
    let hasActiveSnapshot = false;

    for (const mechanismId of context.entities.mechanisms.keys()) {
      const mechanismCore = context.getMechanismCore(mechanismId);
      if (!mechanismCore) {
        continue;
      }
      const snapshot = mechanismCore.getTelemetrySnapshot();
      const signature = JSON.stringify(snapshot);
      const existing = this.telemetrySnapshotsByMechanism.get(mechanismId);
      const hasChanged = force || !existing || existing.signature !== signature;
      if (hasChanged) {
        this.telemetrySnapshotsByMechanism.set(mechanismId, { snapshot, signature });
        this.notifyTelemetryListeners(mechanismId, snapshot);
      }
      if (mechanismId === activeMechanismId) {
        this.telemetrySnapshot = snapshot;
        this.telemetryMechanismId = mechanismId;
        hasActiveSnapshot = true;
      }
    }

    if (!hasActiveSnapshot) {
      const activeEntry = this.telemetrySnapshotsByMechanism.get(activeMechanismId);
      if (activeEntry) {
        this.telemetrySnapshot = activeEntry.snapshot;
        this.telemetryMechanismId = activeMechanismId;
      } else if (force) {
        this.telemetrySnapshot = EMPTY_TELEMETRY_SNAPSHOT;
        this.telemetryMechanismId = null;
        this.notifyTelemetryListeners(null, this.telemetrySnapshot);
      }
    }
  }

  private notifyTelemetryListeners(
    mechanismId: string | null,
    snapshot: SimulationTelemetrySnapshot,
  ): void {
    for (const listener of this.telemetryListeners) {
      listener(snapshot, mechanismId);
    }
  }
}
