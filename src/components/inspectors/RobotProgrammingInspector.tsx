import { useMemo } from 'react';
import RobotProgrammingPanel from '../RobotProgrammingPanel';
import type { InspectorProps } from '../../overlay/inspectorRegistry';
import { useProgrammingInspector } from '../../state/ProgrammingInspectorContext';
import { useSimulationRuntime } from '../../hooks/useSimulationRuntime';
import { MODULE_LIBRARY } from '../../simulation/robot/modules/moduleLibrary';
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

const RobotProgrammingInspector = ({ entity }: InspectorProps): JSX.Element => {
  const {
    workspace,
    onDrop,
    onTouchDrop,
    onUpdateBlock,
    onRemoveBlock,
    robotId,
    runProgram,
    diagnostics,
  } = useProgrammingInspector();
  const { status, stopProgram } = useSimulationRuntime(robotId);

  const installedModules = useMemo(() => {
    const slots = entity.chassis?.slots ?? [];
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

  const isRunning = status === 'running' || entity.programState?.isRunning === true;
  const activeBlockId = entity.programState?.activeBlockId ?? null;
  const canStopProgram = status === 'running' ? stopProgram : undefined;

  return (
    <RobotProgrammingPanel
      workspace={workspace}
      onDrop={onDrop}
      onTouchDrop={onTouchDrop}
      onUpdateBlock={onUpdateBlock}
      onRemoveBlock={onRemoveBlock}
      robotId={robotId}
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

export default RobotProgrammingInspector;
