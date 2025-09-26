import { useCallback, useEffect, useMemo, useState } from 'react';
import SimulationShell from './simulation/SimulationShell';
import { useBlockWorkspace } from './hooks/useBlockWorkspace';
import OnboardingFlow from './onboarding/OnboardingFlow';
import { useMechanismSelection } from './hooks/useMechanismSelection';
import { simulationRuntime } from './state/simulationRuntime';
import { chassisState, inventoryState } from './state/runtime';
import {
  EntityOverlayManagerProvider,
  useEntityOverlayManager,
} from './state/EntityOverlayManager';
import { DragProvider } from './state/DragContext';
import { ProgrammingInspectorProvider } from './state/ProgrammingInspectorContext';
import type { RunProgramResult } from './state/ProgrammingInspectorContext';
import EntityOverlay from './components/EntityOverlay';
import { ensureDefaultInspectorsRegistered } from './overlay/defaultInspectors';
import type { WorkspaceState } from './types/blocks';
import type { EntityOverlayData } from './types/overlay';
import type { EntityId } from './simulation/ecs/world';
import type { ChassisSnapshot } from './simulation/mechanism';
import type { InventorySnapshot } from './simulation/mechanism/inventory';
import styles from './styles/App.module.css';
import type { SlotSchema } from './types/slots';
import type { ProgramDebugState, ProgramRunnerStatus } from './simulation/runtime/blockProgramRunner';
import { compileWorkspaceProgram, type Diagnostic } from './simulation/runtime/blockProgram';

const DEFAULT_MECHANISM_ID = 'MF-01';
const ONBOARDING_ENABLED = false;

ensureDefaultInspectorsRegistered();

const MINIMUM_INVENTORY_SLOTS = 10;

interface InventoryOverlayView {
  capacity: number;
  slots: SlotSchema[];
}

const areDiagnosticsEqual = (
  a: Diagnostic[] | undefined,
  b: Diagnostic[] | undefined,
): boolean => {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((diagnostic, index) => {
    const counterpart = b[index];
    return (
      counterpart?.severity === diagnostic.severity
      && counterpart?.message === diagnostic.message
    );
  });
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

const buildMechanismOverlayData = (
  mechanismId: string,
  entityId: EntityId,
  chassis: ChassisSnapshot,
  inventory: InventoryOverlayView,
  programState: EntityOverlayData['programState'],
): EntityOverlayData => ({
  entityId,
  mechanismId,
  name: `Mechanism ${mechanismId}`,
  description: `Configure systems and programming for chassis ${mechanismId}.`,
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
  const { selectedMechanismId, selectedEntityId, clearSelection } = useMechanismSelection();
  const {
    isOpen,
    activeTab,
    openOverlay,
    closeOverlay,
    selectedEntityId: overlayEntityId,
    getEntityData,
    upsertEntityData,
  } = useEntityOverlayManager();
  const [mechanismPrograms, setMechanismPrograms] = useState<Record<string, WorkspaceState>>({});
  const [compileDiagnosticsByMechanism, setCompileDiagnosticsByMechanism] = useState<Record<string, Diagnostic[]>>({});
  const [workspaceMechanismId, setWorkspaceMechanismId] = useState<string>(
    () => selectedMechanismId ?? DEFAULT_MECHANISM_ID,
  );
  const [chassisSnapshot, setChassisSnapshot] = useState<ChassisSnapshot>(() =>
    chassisState.getSnapshot(),
  );
  const [inventoryOverlay, setInventoryOverlay] = useState<InventoryOverlayView>(() =>
    buildInventoryOverlayData(inventoryState.getSnapshot()),
  );
  const [debugStatesByMechanism, setDebugStatesByMechanism] = useState<Record<string, ProgramDebugState>>({});

  const activeMechanismId = useMemo(() => selectedMechanismId ?? DEFAULT_MECHANISM_ID, [selectedMechanismId]);
  useEffect(() => chassisState.subscribe(setChassisSnapshot), []);

  useEffect(() => {
    const nextState = simulationRuntime.getProgramDebugState(activeMechanismId);
    setDebugStatesByMechanism((current) => {
      const previous = current[activeMechanismId];
      if (previous === nextState) {
        return current;
      }
      return { ...current, [activeMechanismId]: nextState };
    });
  }, [activeMechanismId]);

  useEffect(
    () =>
      simulationRuntime.subscribeProgramDebug(activeMechanismId, (state) => {
        setDebugStatesByMechanism((current) => {
          const previous = current[activeMechanismId];
          if (previous === state) {
            return current;
          }
          return { ...current, [activeMechanismId]: state };
        });
      }),
    [activeMechanismId],
  );

  useEffect(
    () =>
      inventoryState.subscribe((snapshot) => {
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
    setChassisSnapshot(chassisState.getSnapshot());
  }, [selectedMechanismId]);

  const getWorkspaceForMechanism = useCallback(
    (mechanismId: string): WorkspaceState => {
      if (mechanismId === workspaceMechanismId) {
        return workspace;
      }
      return mechanismPrograms[mechanismId] ?? [];
    },
    [mechanismPrograms, workspace, workspaceMechanismId],
  );

  const buildProgramStateForMechanism = useCallback(
    (
      mechanismId: string,
      statusOverride?: ProgramRunnerStatus,
    ): EntityOverlayData['programState'] => {
      const status = statusOverride ?? simulationRuntime.getStatus(mechanismId);
      const isRunning = status === 'running';
      const debugState = debugStatesByMechanism[mechanismId]
        ?? simulationRuntime.getProgramDebugState(mechanismId);
      const activeBlockId = isRunning ? debugState.currentInstruction?.sourceBlockId ?? null : null;
      const diagnostics = compileDiagnosticsByMechanism[mechanismId] ?? [];
      return { isRunning, activeBlockId, status, diagnostics };
    },
    [compileDiagnosticsByMechanism, debugStatesByMechanism],
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

  const openOverlayForMechanism = useCallback(
    (mechanismId: string, entityId: EntityId | null, initialTab?: 'systems' | 'programming' | 'info') => {
      const resolvedEntity = resolveEntityId(entityId);
      const chassis = simulationRuntime.getChassisSnapshot(mechanismId);
      const programState = buildProgramStateForMechanism(mechanismId);
      openOverlay(buildMechanismOverlayData(mechanismId, resolvedEntity, chassis, inventoryOverlay, programState), {
        initialTab,
      });
    },
    [buildProgramStateForMechanism, inventoryOverlay, openOverlay, resolveEntityId],
  );

  const handleEntitySelect = useCallback(
    ({ mechanismId, entityId }: { mechanismId: string; entityId: EntityId }) => {
      openOverlayForMechanism(mechanismId, entityId, 'systems');
    },
    [openOverlayForMechanism],
  );

  const handleEntityClear = useCallback(() => {
    closeOverlay();
  }, [closeOverlay]);

  const handleProgramMechanism = useCallback(() => {
    const mechanismId = selectedMechanismId ?? DEFAULT_MECHANISM_ID;
    const resolvedEntity = resolveEntityId(selectedEntityId ?? overlayEntityId ?? null);
    simulationRuntime.setSelectedMechanism(mechanismId, resolvedEntity);
    openOverlayForMechanism(mechanismId, resolvedEntity, 'programming');
  }, [openOverlayForMechanism, overlayEntityId, resolveEntityId, selectedEntityId, selectedMechanismId]);

  const handleTabShortcut = useCallback(
    (tab: 'systems' | 'info' | 'programming') => {
      const mechanismId = selectedMechanismId ?? DEFAULT_MECHANISM_ID;
      const resolvedEntity = resolveEntityId(selectedEntityId ?? overlayEntityId ?? null);
      simulationRuntime.setSelectedMechanism(mechanismId, resolvedEntity);
      openOverlayForMechanism(mechanismId, resolvedEntity, tab);
    },
    [openOverlayForMechanism, overlayEntityId, resolveEntityId, selectedEntityId, selectedMechanismId],
  );

  const handleOverlayClose = useCallback(() => {
    closeOverlay();
    clearSelection();
  }, [clearSelection, closeOverlay]);

  const runProgramForActiveMechanism = useCallback<() => RunProgramResult>(() => {
    const result = compileWorkspaceProgram(workspace);
    const diagnostics = result.diagnostics;
    setCompileDiagnosticsByMechanism((current) => {
      const existing = current[activeMechanismId];
      const next = { ...current };
      if (diagnostics.length === 0) {
        if (existing) {
          delete next[activeMechanismId];
          return next;
        }
        return current;
      }
      next[activeMechanismId] = diagnostics;
      return next;
    });
    simulationRuntime.reportCompileDiagnostics(activeMechanismId, diagnostics);
    const blocked = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
    if (!blocked) {
      simulationRuntime.runProgram(activeMechanismId, result.program);
    }
    return {
      diagnostics,
      stepCount: result.program.instructions.length,
      blocked,
    };
  }, [activeMechanismId, setCompileDiagnosticsByMechanism, workspace]);

  useEffect(() => {
    if (workspaceMechanismId === activeMechanismId) {
      return;
    }

    const targetProgram = mechanismPrograms[activeMechanismId];
    if (targetProgram) {
      if (workspace !== targetProgram) {
        replaceWorkspace(() => targetProgram);
      }
    } else if (workspace.length > 0) {
      replaceWorkspace(() => []);
    }

    setWorkspaceMechanismId(activeMechanismId);
  }, [activeMechanismId, mechanismPrograms, replaceWorkspace, workspace, workspaceMechanismId]);

  useEffect(() => {
    setMechanismPrograms((current) => {
      const existing = current[workspaceMechanismId];
      if (existing === workspace) {
        return current;
      }
      if (!existing && workspace.length === 0) {
        return current;
      }
      return {
        ...current,
        [workspaceMechanismId]: workspace,
      };
    });
  }, [workspace, workspaceMechanismId]);

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
        handleProgramMechanism();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleProgramMechanism, handleTabShortcut]);

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
    if (!entity || entity.overlayType !== 'complex' || !entity.mechanismId) {
      return;
    }
    const nextProgramState = buildProgramStateForMechanism(entity.mechanismId);
    const previousProgramState = entity.programState ?? {
      isRunning: false,
      activeBlockId: null,
      status: 'idle' as ProgramRunnerStatus,
      diagnostics: [],
    };
    if (
      previousProgramState.isRunning !== nextProgramState?.isRunning
      || previousProgramState.activeBlockId !== nextProgramState?.activeBlockId
      || previousProgramState.status !== nextProgramState?.status
      || !areDiagnosticsEqual(previousProgramState.diagnostics, nextProgramState?.diagnostics)
    ) {
      upsertEntityData({ ...entity, programState: nextProgramState }, { silent: true });
    }
  }, [
    buildProgramStateForMechanism,
    getEntityData,
    overlayEntityId,
    mechanismPrograms,
    upsertEntityData,
    workspace,
  ]);

  useEffect(() => {
    const unsubscribe = simulationRuntime.subscribeStatus(activeMechanismId, (status) => {
      if (overlayEntityId === null) {
        return;
      }
      const entity = getEntityData(overlayEntityId);
      if (!entity || entity.overlayType !== 'complex' || entity.mechanismId !== activeMechanismId) {
        return;
      }
      const nextProgramState = buildProgramStateForMechanism(activeMechanismId, status);
      const previousProgramState = entity.programState ?? {
        isRunning: false,
        activeBlockId: null,
        status: 'idle' as ProgramRunnerStatus,
        diagnostics: [],
      };
      if (
        previousProgramState.isRunning !== nextProgramState?.isRunning
        || previousProgramState.activeBlockId !== nextProgramState?.activeBlockId
        || previousProgramState.status !== nextProgramState?.status
        || !areDiagnosticsEqual(previousProgramState.diagnostics, nextProgramState?.diagnostics)
      ) {
        upsertEntityData({ ...entity, programState: nextProgramState }, { silent: true });
      }
    });
    return unsubscribe;
  }, [
    activeMechanismId,
    buildProgramStateForMechanism,
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
      mechanismId: activeMechanismId,
      runProgram: runProgramForActiveMechanism,
      diagnostics: compileDiagnosticsByMechanism[activeMechanismId] ?? [],
    }),
    [
      activeMechanismId,
      compileDiagnosticsByMechanism,
      handleDrop,
      handleTouchDrop,
      removeBlockInstance,
      runProgramForActiveMechanism,
      updateBlockInstance,
      workspace,
    ],
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
          onClick={handleProgramMechanism}
          data-active={isOpen && activeTab === 'programming'}
          data-testid="select-mechanism"
        >
          Program mechanism
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
          openProgrammingOverlay={handleProgramMechanism}
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
