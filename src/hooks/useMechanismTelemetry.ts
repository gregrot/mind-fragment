import { useEffect, useMemo, useState } from 'react';
import type { SimulationTelemetrySnapshot } from '../simulation/runtime/ecsBlackboard';
import { MODULE_LIBRARY } from '../simulation/mechanism/modules/moduleLibrary';
import { simulationRuntime } from '../state/simulationRuntime';
import { telemetryState } from '../state/runtime';

interface TelemetryValueMetadata {
  label?: string;
  description?: string;
}

export interface MechanismTelemetrySignal {
  id: string;
  key: string;
  moduleId: string;
  label: string;
  value: unknown;
  description?: string;
}

export interface MechanismTelemetryModuleGroup {
  moduleId: string;
  label: string;
  signals: MechanismTelemetrySignal[];
}

export interface MechanismTelemetryData {
  mechanismId: string | null;
  snapshot: SimulationTelemetrySnapshot;
  modules: MechanismTelemetryModuleGroup[];
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

const extractModules = (snapshot: SimulationTelemetrySnapshot): MechanismTelemetryModuleGroup[] => {
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
        } satisfies MechanismTelemetrySignal;
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      moduleId,
      label,
      signals,
    } satisfies MechanismTelemetryModuleGroup;
  });
};

const EMPTY_TELEMETRY: SimulationTelemetrySnapshot = { values: {}, actions: {} };

export const useMechanismTelemetry = (): MechanismTelemetryData => {
  const [state, setState] = useState<{ mechanismId: string | null; snapshot: SimulationTelemetrySnapshot }>(() => {
    const mechanismId = simulationRuntime.getSelectedMechanism();
    const snapshot = telemetryState.getSnapshot(mechanismId ?? null);
    return { mechanismId, snapshot };
  });

  useEffect(
    () =>
      telemetryState.subscribe((snapshot, mechanismId) => {
        setState((current) => ({ mechanismId: mechanismId ?? current.mechanismId ?? null, snapshot }));
      }),
    [],
  );

  const modules = useMemo(() => extractModules(state.snapshot), [state.snapshot]);

  return {
    mechanismId: state.mechanismId,
    snapshot: state.snapshot ?? EMPTY_TELEMETRY,
    modules,
  };
};

export default useMechanismTelemetry;
