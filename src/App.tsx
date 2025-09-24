import { useCallback, useEffect, useMemo, useState } from 'react';
import SimulationShell from './simulation/SimulationShell';
import { useBlockWorkspace } from './hooks/useBlockWorkspace';
import OnboardingFlow from './onboarding/OnboardingFlow';
import { useRobotSelection } from './hooks/useRobotSelection';
import { simulationRuntime } from './state/simulationRuntime';
import {
  EntityOverlayManagerProvider,
  useEntityOverlayManager,
} from './state/EntityOverlayManager';
import { DragProvider } from './state/DragContext';
import { ProgrammingInspectorProvider } from './state/ProgrammingInspectorContext';
import EntityOverlay from './components/EntityOverlay';
import { ensureDefaultInspectorsRegistered } from './overlay/defaultInspectors';
import type { WorkspaceState } from './types/blocks';
import type { EntityOverlayData } from './types/overlay';
import type { EntityId } from './simulation/ecs/world';
import type { ChassisSnapshot } from './simulation/robot';
import type { InventorySnapshot } from './simulation/robot/inventory';
import styles from './styles/App.module.css';
import type { SlotSchema } from './types/slots';
import type { ProgramRunnerStatus } from './simulation/runtime/blockProgramRunner';

const DEFAULT_ROBOT_ID = 'MF-01';
const ONBOARDING_ENABLED = false;

ensureDefaultInspectorsRegistered();

const MINIMUM_INVENTORY_SLOTS = 10;

interface InventoryOverlayView {
  capacity: number;
  slots: SlotSchema[];
}

const resolveActiveBlockId = (workspace: WorkspaceState): string | null => {
  if (workspace.length === 0) {
    return null;
  }

  const startBlock = workspace.find((block) => block.type === 'start');
  if (startBlock) {
    const firstAction = startBlock.slots?.do?.[0];
    return firstAction?.instanceId ?? startBlock.instanceId;
  }

  return workspace[0]?.instanceId ?? null;
};

const buildInventoryOverlayData = (snapshot: InventorySnapshot): InventoryOverlayView => {
  const sortedSlots = [...(snapshot.slots ?? [])].sort((a, b) => a.index - b.index);
  const capacity = sortedSlots.length || Math.max(snapshot.slotCapacity ?? 0, MINIMUM_INVENTORY_SLOTS);
  if (sortedSlots.length >= capacity) {
    return { capacity, slots: sortedSlots };
  }
  const paddedSlots: SlotSchema[] = [...sortedSlots];
  for (let index = sortedSlots.length; index < capacity; index += 1) {
    paddedSlots.push({
      id: `inventory-${index}`,
      index,
      occupantId: null,
      metadata: { stackable: true, moduleSubtype: undefined, locked: false },
    });
  }
  return { capacity, slots: paddedSlots };
};

const areInventoryOverlaysEqual = (
  a: InventoryOverlayView,
  b: InventoryOverlayView,
): boolean => {
  if (a.capacity !== b.capacity) {
    return false;
  }
  if (a.slots.length !== b.slots.length) {
    return false;
  }
  for (let index = 0; index < a.slots.length; index += 1) {
    const slotA = a.slots[index]!;
    const slotB = b.slots[index]!;
    if (
      slotA.id !== slotB.id ||
      slotA.index !== slotB.index ||
      slotA.occupantId !== slotB.occupantId ||
      (slotA.stackCount ?? null) !== (slotB.stackCount ?? null) ||
      slotA.metadata.stackable !== slotB.metadata.stackable ||
      slotA.metadata.locked !== slotB.metadata.locked ||
      slotA.metadata.moduleSubtype !== slotB.metadata.moduleSubtype
    ) {
      return false;
    }
  }
  return true;
};

const buildRobotOverlayData = (
  robotId: string,
  entityId: EntityId,
  chassis: ChassisSnapshot,
  inventory: InventoryOverlayView,
  programState: EntityOverlayData['programState'],
): EntityOverlayData => ({
  entityId,
  robotId,
  name: `Robot ${robotId}`,
  description: `Configure systems and programming for chassis ${robotId}.`,
  overlayType: 'complex',
  chassis: {
    capacity: chassis.capacity,
    slots: chassis.slots,
  },
  inventory,
  programState,
});

const AppContent = (): JSX.Element => {
  const {
    workspace,
    handleDrop,
    handleTouchDrop,
    replaceWorkspace,
    updateBlockInstance,
    removeBlockInstance,
  } = useBlockWorkspace();
  const { selectedRobotId, selectedEntityId, clearSelection } = useRobotSelection();
  const {
    isOpen,
    activeTab,
    openOverlay,
    closeOverlay,
    selectedEntityId: overlayEntityId,
    getEntityData,
    upsertEntityData,
  } = useEntityOverlayManager();
  const [robotPrograms, setRobotPrograms] = useState<Record<string, WorkspaceState>>({});
  const [workspaceRobotId, setWorkspaceRobotId] = useState<string>(
    () => selectedRobotId ?? DEFAULT_ROBOT_ID,
  );
  const [chassisSnapshot, setChassisSnapshot] = useState<ChassisSnapshot>(() =>
    simulationRuntime.getChassisSnapshot(selectedRobotId ?? DEFAULT_ROBOT_ID),
  );
  const [inventoryOverlay, setInventoryOverlay] = useState<InventoryOverlayView>(() =>
    buildInventoryOverlayData(simulationRuntime.getInventorySnapshot()),
  );

  const activeRobotId = useMemo(() => selectedRobotId ?? DEFAULT_ROBOT_ID, [selectedRobotId]);

  useEffect(() => simulationRuntime.subscribeChassis(setChassisSnapshot), []);

  useEffect(
    () =>
      simulationRuntime.subscribeInventory((snapshot) => {
        setInventoryOverlay((current) => {
          const next = buildInventoryOverlayData(snapshot);
          if (areInventoryOverlaysEqual(current, next)) {
            return current;
          }
          return next;
        });
      }),
    [],
  );

  useEffect(() => {
    setChassisSnapshot(simulationRuntime.getChassisSnapshot(selectedRobotId));
  }, [selectedRobotId]);

  const getWorkspaceForRobot = useCallback(
    (robotId: string): WorkspaceState => {
      if (robotId === workspaceRobotId) {
        return workspace;
      }
      return robotPrograms[robotId] ?? [];
    },
    [robotPrograms, workspace, workspaceRobotId],
  );

  const buildProgramStateForRobot = useCallback(
    (
      robotId: string,
      statusOverride?: ProgramRunnerStatus,
    ): EntityOverlayData['programState'] => {
      const workspaceForRobot = getWorkspaceForRobot(robotId);
      const status = statusOverride ?? simulationRuntime.getStatus(robotId);
      const isRunning = status === 'running';
      const activeBlockId = isRunning ? resolveActiveBlockId(workspaceForRobot) : null;
      return { isRunning, activeBlockId };
    },
    [getWorkspaceForRobot],
  );

  const resolveEntityId = useCallback(
    (entityId: EntityId | null): EntityId => {
      if (entityId !== null && entityId !== undefined) {
        return entityId;
      }
      if (overlayEntityId !== null) {
        return overlayEntityId;
      }
      return 0 as EntityId;
    },
    [overlayEntityId],
  );

  const openOverlayForRobot = useCallback(
    (robotId: string, entityId: EntityId | null, initialTab?: 'systems' | 'programming' | 'info') => {
      const resolvedEntity = resolveEntityId(entityId);
      const chassis = simulationRuntime.getChassisSnapshot(robotId);
      const programState = buildProgramStateForRobot(robotId);
      openOverlay(buildRobotOverlayData(robotId, resolvedEntity, chassis, inventoryOverlay, programState), {
        initialTab,
      });
    },
    [buildProgramStateForRobot, inventoryOverlay, openOverlay, resolveEntityId],
  );

  const handleEntitySelect = useCallback(
    ({ robotId, entityId }: { robotId: string; entityId: EntityId }) => {
      openOverlayForRobot(robotId, entityId, 'systems');
    },
    [openOverlayForRobot],
  );

  const handleEntityClear = useCallback(() => {
    closeOverlay();
  }, [closeOverlay]);

  const handleProgramRobot = useCallback(() => {
    const robotId = selectedRobotId ?? DEFAULT_ROBOT_ID;
    const resolvedEntity = resolveEntityId(selectedEntityId ?? overlayEntityId ?? null);
    simulationRuntime.setSelectedRobot(robotId, resolvedEntity);
    openOverlayForRobot(robotId, resolvedEntity, 'programming');
  }, [openOverlayForRobot, overlayEntityId, resolveEntityId, selectedEntityId, selectedRobotId]);

  const handleTabShortcut = useCallback(
    (tab: 'systems' | 'info' | 'programming') => {
      const robotId = selectedRobotId ?? DEFAULT_ROBOT_ID;
      const resolvedEntity = resolveEntityId(selectedEntityId ?? overlayEntityId ?? null);
      simulationRuntime.setSelectedRobot(robotId, resolvedEntity);
      openOverlayForRobot(robotId, resolvedEntity, tab);
    },
    [openOverlayForRobot, overlayEntityId, resolveEntityId, selectedEntityId, selectedRobotId],
  );

  const handleOverlayClose = useCallback(() => {
    closeOverlay();
    clearSelection();
  }, [clearSelection, closeOverlay]);

  useEffect(() => {
    if (workspaceRobotId === activeRobotId) {
      return;
    }

    const targetProgram = robotPrograms[activeRobotId];
    if (targetProgram) {
      if (workspace !== targetProgram) {
        replaceWorkspace(() => targetProgram);
      }
    } else if (workspace.length > 0) {
      replaceWorkspace(() => []);
    }

    setWorkspaceRobotId(activeRobotId);
  }, [activeRobotId, robotPrograms, replaceWorkspace, workspace, workspaceRobotId]);

  useEffect(() => {
    setRobotPrograms((current) => {
      const existing = current[workspaceRobotId];
      if (existing === workspace) {
        return current;
      }
      if (!existing && workspace.length === 0) {
        return current;
      }
      return {
        ...current,
        [workspaceRobotId]: workspace,
      };
    });
  }, [workspace, workspaceRobotId]);

  useEffect(() => {
    const isEditableElement = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditableElement(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 's') {
        handleTabShortcut('systems');
        return;
      }

      if (key === 'i') {
        handleTabShortcut('info');
        return;
      }

      if (key === 'p') {
        handleProgramRobot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleProgramRobot, handleTabShortcut]);

  useEffect(() => {
    if (overlayEntityId === null) {
      return;
    }
    const entity = getEntityData(overlayEntityId);
    if (!entity || entity.overlayType !== 'complex') {
      return;
    }
    if (
      entity.chassis &&
      entity.chassis.capacity === chassisSnapshot.capacity &&
      entity.chassis.slots === chassisSnapshot.slots
    ) {
      return;
    }
    upsertEntityData(
      {
        ...entity,
        chassis: { capacity: chassisSnapshot.capacity, slots: chassisSnapshot.slots },
      },
      { silent: true },
    );
  }, [chassisSnapshot, getEntityData, overlayEntityId, upsertEntityData]);

  useEffect(() => {
    if (overlayEntityId === null) {
      return;
    }
    const entity = getEntityData(overlayEntityId);
    if (!entity || entity.overlayType !== 'complex') {
      return;
    }
    if (
      entity.inventory &&
      entity.inventory.capacity === inventoryOverlay.capacity &&
      entity.inventory.slots === inventoryOverlay.slots
    ) {
      return;
    }
    upsertEntityData(
      {
        ...entity,
        inventory: { capacity: inventoryOverlay.capacity, slots: inventoryOverlay.slots },
      },
      { silent: true },
    );
  }, [getEntityData, inventoryOverlay, overlayEntityId, upsertEntityData]);

  useEffect(() => {
    if (overlayEntityId === null) {
      return;
    }
    const entity = getEntityData(overlayEntityId);
    if (!entity || entity.overlayType !== 'complex' || !entity.robotId) {
      return;
    }
    const nextProgramState = buildProgramStateForRobot(entity.robotId);
    const previousProgramState = entity.programState ?? { isRunning: false, activeBlockId: null };
    if (
      previousProgramState.isRunning !== nextProgramState?.isRunning
      || previousProgramState.activeBlockId !== nextProgramState?.activeBlockId
    ) {
      upsertEntityData({ ...entity, programState: nextProgramState }, { silent: true });
    }
  }, [
    buildProgramStateForRobot,
    getEntityData,
    overlayEntityId,
    robotPrograms,
    upsertEntityData,
    workspace,
  ]);

  useEffect(() => {
    const unsubscribe = simulationRuntime.subscribeStatus(activeRobotId, (status) => {
      if (overlayEntityId === null) {
        return;
      }
      const entity = getEntityData(overlayEntityId);
      if (!entity || entity.overlayType !== 'complex' || entity.robotId !== activeRobotId) {
        return;
      }
      const nextProgramState = buildProgramStateForRobot(activeRobotId, status);
      const previousProgramState = entity.programState ?? { isRunning: false, activeBlockId: null };
      if (
        previousProgramState.isRunning !== nextProgramState?.isRunning
        || previousProgramState.activeBlockId !== nextProgramState?.activeBlockId
      ) {
        upsertEntityData({ ...entity, programState: nextProgramState }, { silent: true });
      }
    });
    return unsubscribe;
  }, [
    activeRobotId,
    buildProgramStateForRobot,
    getEntityData,
    overlayEntityId,
    upsertEntityData,
  ]);

  const programmingContextValue = useMemo(
    () => ({
      workspace,
      onDrop: handleDrop,
      onTouchDrop: handleTouchDrop,
      onUpdateBlock: updateBlockInstance,
      onRemoveBlock: removeBlockInstance,
      robotId: activeRobotId,
    }),
    [activeRobotId, handleDrop, handleTouchDrop, removeBlockInstance, updateBlockInstance, workspace],
  );

  return (
    <div className={styles.appShell}>
      <SimulationShell onEntitySelect={handleEntitySelect} onEntityClear={handleEntityClear} />
      <div className={styles.controlBar} role="toolbar" aria-label="Simulation interface controls">
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => handleTabShortcut('systems')}
          data-active={isOpen && activeTab === 'systems'}
        >
          Systems
        </button>
        <button
          type="button"
          className={styles.controlButton}
          onClick={() => handleTabShortcut('info')}
          data-active={isOpen && activeTab === 'info'}
        >
          Info
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.controlButtonPrimary}`}
          onClick={handleProgramRobot}
          data-active={isOpen && activeTab === 'programming'}
          data-testid="select-robot"
        >
          Program robot
        </button>
      </div>
      <ProgrammingInspectorProvider value={programmingContextValue}>
        <DragProvider>
          <EntityOverlay onClose={handleOverlayClose} />
        </DragProvider>
      </ProgrammingInspectorProvider>
      {ONBOARDING_ENABLED ? (
        <OnboardingFlow
          replaceWorkspace={replaceWorkspace}
          openProgrammingOverlay={handleProgramRobot}
        />
      ) : null}
    </div>
  );
};

const App = (): JSX.Element => {
  return (
    <EntityOverlayManagerProvider>
      <AppContent />
    </EntityOverlayManagerProvider>
  );
};

export default App;
