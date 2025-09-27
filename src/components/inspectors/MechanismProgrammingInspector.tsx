import { useCallback, useMemo } from 'react';
import MechanismProgrammingPanel from '../MechanismProgrammingPanel';
import type { PaletteBlockEntry } from '../BlockPalette';
import type { InspectorProps } from '../../overlay/inspectorRegistry';
import { useProgrammingInspector } from '../../state/ProgrammingInspectorContext';
import { useSimulationRuntime } from '../../hooks/useSimulationRuntime';
import { DEFAULT_MODULE_LOADOUT, MODULE_LIBRARY } from '../../simulation/mechanism/modules/moduleLibrary';
import { BLOCK_LIBRARY } from '../../blocks/library';
import type { BlockInstance, WorkspaceState } from '../../types/blocks';

const MODULE_LABELS = new Map(MODULE_LIBRARY.map((module) => [module.id, module.title]));

const BLOCK_MODULE_REQUIREMENTS: Record<string, string[]> = {
  move: ['core.movement'],
  'move-to': ['core.movement', 'sensor.survey'],
  turn: ['core.movement'],
  'scan-resources': ['sensor.survey'],
  'gather-resource': ['arm.manipulator'],
  'deposit-cargo': ['arm.manipulator'],
  'toggle-status': ['status.signal'],
  'set-status': ['status.signal'],
  'broadcast-signal': ['status.signal'],
};

const gatherModuleRequirements = (
  blocks: WorkspaceState,
): Map<string, Set<string>> => {
  const requirements = new Map<string, Set<string>>();

  const visit = (block: BlockInstance): void => {
    const requiredModules = BLOCK_MODULE_REQUIREMENTS[block.type];
    if (requiredModules) {
      for (const moduleId of requiredModules) {
        const existing = requirements.get(moduleId) ?? new Set<string>();
        existing.add(block.instanceId);
        requirements.set(moduleId, existing);
      }
    }

    if (block.slots) {
      for (const slotBlocks of Object.values(block.slots)) {
        for (const child of slotBlocks) {
          visit(child);
        }
      }
    }

    if (block.expressionInputs) {
      for (const expressionBlocks of Object.values(block.expressionInputs)) {
        for (const child of expressionBlocks) {
          visit(child);
        }
      }
    }
  };

  for (const block of blocks) {
    visit(block);
  }

  return requirements;
};

const MechanismProgrammingInspector = ({ entity }: InspectorProps): JSX.Element => {
  const {
    workspace,
    onDrop,
    onTouchDrop,
    onUpdateBlock,
    onRemoveBlock,
    mechanismId,
    runProgram,
    diagnostics,
  } = useProgrammingInspector();
  const { status, stopProgram } = useSimulationRuntime(mechanismId);

  const installedModules = useMemo(() => {
    const slots = entity.chassis?.slots;
    if (!slots || slots.length === 0) {
      return new Set(DEFAULT_MODULE_LOADOUT);
    }

    const installed = new Set<string>();
    for (const slot of slots) {
      if (slot.occupantId) {
        installed.add(slot.occupantId);
      }
    }
    return installed;
  }, [entity.chassis?.slots]);

  const requirementMap = useMemo(() => gatherModuleRequirements(workspace), [workspace]);

  const missingModuleIds = useMemo(() => {
    const missing: string[] = [];
    for (const moduleId of requirementMap.keys()) {
      if (!installedModules.has(moduleId)) {
        missing.push(moduleId);
      }
    }
    return missing;
  }, [installedModules, requirementMap]);

  const warningBlockIds = useMemo(() => {
    const ids = new Set<string>();
    for (const moduleId of missingModuleIds) {
      const blocks = requirementMap.get(moduleId);
      if (blocks) {
        for (const blockId of blocks) {
          ids.add(blockId);
        }
      }
    }
    return ids;
  }, [missingModuleIds, requirementMap]);

  const moduleWarnings = useMemo(() => {
    return missingModuleIds.map((moduleId) => {
      const label = MODULE_LABELS.get(moduleId) ?? moduleId;
      return `Install ${label} (${moduleId}) to enable blocks that depend on it.`;
    });
  }, [missingModuleIds]);

  const formatModuleList = useCallback((moduleIds: string[]): string => {
    if (moduleIds.length === 0) {
      return '';
    }

    const labels = moduleIds.map((moduleId) => MODULE_LABELS.get(moduleId) ?? moduleId);
    if (labels.length === 1) {
      return labels[0];
    }

    if (labels.length === 2) {
      return `${labels[0]} and ${labels[1]}`;
    }

    const last = labels.pop();
    return `${labels.join(', ')}, and ${last}`;
  }, []);

  const paletteBlocks = useMemo<PaletteBlockEntry[]>(() => {
    return BLOCK_LIBRARY.map((definition) => {
      const requiredModules = BLOCK_MODULE_REQUIREMENTS[definition.id];
      if (!requiredModules || requiredModules.every((moduleId) => installedModules.has(moduleId))) {
        return { definition, isLocked: false };
      }

      const missingModules = requiredModules.filter((moduleId) => !installedModules.has(moduleId));
      const moduleList = formatModuleList(missingModules);
      const lockMessage = moduleList
        ? `Install ${moduleList} to use this block.`
        : 'Install the required module to use this block.';

      return {
        definition,
        isLocked: true,
        lockMessage,
      };
    });
  }, [formatModuleList, installedModules]);

  const isRunning = status === 'running' || entity.programState?.isRunning === true;
  const activeBlockId = entity.programState?.activeBlockId ?? null;
  const canStopProgram = status === 'running' ? stopProgram : undefined;

  return (
    <MechanismProgrammingPanel
      paletteBlocks={paletteBlocks}
      workspace={workspace}
      onDrop={onDrop}
      onTouchDrop={onTouchDrop}
      onUpdateBlock={onUpdateBlock}
      onRemoveBlock={onRemoveBlock}
      mechanismId={mechanismId}
      isReadOnly={isRunning}
      onRequestStop={canStopProgram}
      moduleWarnings={moduleWarnings}
      activeBlockId={activeBlockId}
      warningBlockIds={warningBlockIds}
      diagnostics={diagnostics}
      onRunProgram={runProgram}
    />
  );
};

export default MechanismProgrammingInspector;
