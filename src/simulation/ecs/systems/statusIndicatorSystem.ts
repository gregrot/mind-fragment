import type { SimulationWorldComponents, StatusIndicatorComponent } from '../../runtime/simulationWorld';
import type { MechanismChassis } from '../../mechanism';
import type { ComponentHandle, System } from '../world';

interface StatusIndicatorSystemDependencies
  extends Pick<SimulationWorldComponents, 'MechanismCore' | 'StatusIndicator'> {}

interface StatusIndicatorSystemOptions {
  statusModuleId: string;
}

export function createStatusIndicatorSystem(
  { MechanismCore, StatusIndicator }: StatusIndicatorSystemDependencies,
  { statusModuleId }: StatusIndicatorSystemOptions,
): System<[
  ComponentHandle<MechanismChassis>,
  ComponentHandle<StatusIndicatorComponent>,
]> {
  return {
    name: 'StatusIndicatorSystem',
    createQuery: (world) => world.query.withAll(MechanismCore, StatusIndicator),
    update: (_world, entities) => {
      for (const [, mechanismCore, { indicator }] of entities) {
        const hasStatusModule = Boolean(mechanismCore.moduleStack.getModule(statusModuleId));

        if (!hasStatusModule) {
          indicator.visible = false;
          continue;
        }

        const telemetry = mechanismCore.getTelemetrySnapshot();
        const statusTelemetry = telemetry.values?.[statusModuleId];
        const activeEntry = statusTelemetry?.active;
        const isActive = typeof activeEntry?.value === 'boolean' ? activeEntry.value : false;

        indicator.alpha = isActive ? 1 : 0.2;
        indicator.visible = true;
      }
    },
  };
}
