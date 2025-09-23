import { useEffect, useMemo, useState } from 'react';
import type { SimulationTelemetrySnapshot } from '../simulation/runtime/ecsBlackboard';
import { MODULE_LIBRARY } from '../simulation/robot/modules/moduleLibrary';
import { simulationRuntime } from '../state/simulationRuntime';

interface TelemetryValueMetadata {
  label?: string;
  description?: string;
}

export interface RobotTelemetrySignal {
  id: string;
  key: string;
  moduleId: string;
  label: string;
  value: unknown;
  description?: string;
}

export interface RobotTelemetryModuleGroup {
  moduleId: string;
  label: string;
  signals: RobotTelemetrySignal[];
}

export interface RobotTelemetryData {
  robotId: string | null;
  snapshot: SimulationTelemetrySnapshot;
  modules: RobotTelemetryModuleGroup[];
}

const MODULE_BLUEPRINT_MAP = MODULE_LIBRARY.reduce<Record<string, (typeof MODULE_LIBRARY)[number]>>(
  (accumulator, blueprint) => {
    accumulator[blueprint.id] = blueprint;
    return accumulator;
  },
  {},
);

const formatTitleCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)([a-z])/g, (match) => match.toUpperCase());

const buildModuleLabel = (moduleId: string): string => {
  const blueprint = MODULE_BLUEPRINT_MAP[moduleId];
  if (blueprint?.title) {
    return blueprint.title;
  }
  return formatTitleCase(moduleId);
};

const buildSignalLabel = (key: string, metadata: TelemetryValueMetadata | undefined): string => {
  if (metadata?.label) {
    return metadata.label;
  }
  return formatTitleCase(key);
};

const buildSignalDescription = (
  metadata: TelemetryValueMetadata | undefined,
): string | undefined => {
  if (metadata?.description && typeof metadata.description === 'string') {
    return metadata.description;
  }
  return undefined;
};

const extractModules = (snapshot: SimulationTelemetrySnapshot): RobotTelemetryModuleGroup[] => {
  const moduleIds = new Set<string>();
  for (const moduleId of Object.keys(snapshot.values ?? {})) {
    moduleIds.add(moduleId);
  }
  for (const moduleId of Object.keys(snapshot.actions ?? {})) {
    moduleIds.add(moduleId);
  }

  const sortedModuleIds = Array.from(moduleIds).sort((a, b) => buildModuleLabel(a).localeCompare(buildModuleLabel(b)));

  return sortedModuleIds.map((moduleId) => {
    const label = buildModuleLabel(moduleId);
    const values = snapshot.values?.[moduleId] ?? {};
    const signals = Object.entries(values)
      .map(([key, entry]) => {
        const metadata = (entry?.metadata ?? {}) as TelemetryValueMetadata;
        return {
          id: `${moduleId}.${key}`,
          key,
          moduleId,
          label: buildSignalLabel(key, metadata),
          description: buildSignalDescription(metadata),
          value: entry?.value,
        } satisfies RobotTelemetrySignal;
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      moduleId,
      label,
      signals,
    } satisfies RobotTelemetryModuleGroup;
  });
};

const EMPTY_TELEMETRY: SimulationTelemetrySnapshot = { values: {}, actions: {} };

export const useRobotTelemetry = (): RobotTelemetryData => {
  const [state, setState] = useState<{ robotId: string | null; snapshot: SimulationTelemetrySnapshot }>(() => {
    const robotId = simulationRuntime.getSelectedRobot();
    const snapshot = simulationRuntime.getTelemetrySnapshot(robotId ?? null);
    return { robotId, snapshot };
  });

  useEffect(
    () =>
      simulationRuntime.subscribeTelemetry((snapshot, robotId) => {
        setState((current) => ({ robotId: robotId ?? current.robotId ?? null, snapshot }));
      }),
    [],
  );

  const modules = useMemo(() => extractModules(state.snapshot), [state.snapshot]);

  return {
    robotId: state.robotId,
    snapshot: state.snapshot ?? EMPTY_TELEMETRY,
    modules,
  };
};

export default useRobotTelemetry;
