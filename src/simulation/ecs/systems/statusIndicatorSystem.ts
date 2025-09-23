import type { SimulationWorldComponents, StatusIndicatorComponent } from '../../runtime/simulationWorld';
import type { RobotChassis } from '../../robot';
import type { ComponentHandle, System } from '../world';

interface StatusIndicatorSystemDependencies
  extends Pick<SimulationWorldComponents, 'RobotCore' | 'StatusIndicator'> {}

interface StatusIndicatorSystemOptions {
  statusModuleId: string;
}

export function createStatusIndicatorSystem(
  { RobotCore, StatusIndicator }: StatusIndicatorSystemDependencies,
  { statusModuleId }: StatusIndicatorSystemOptions,
): System<[
  ComponentHandle<RobotChassis>,
  ComponentHandle<StatusIndicatorComponent>,
]> {
  return {
    name: 'StatusIndicatorSystem',
    components: [RobotCore, StatusIndicator],
    update: (_world, entities) => {
      for (const [, robotCore, { indicator }] of entities) {
        const hasStatusModule = Boolean(robotCore.moduleStack.getModule(statusModuleId));

        if (!hasStatusModule) {
          indicator.visible = false;
          continue;
        }

        const telemetry = robotCore.getTelemetrySnapshot();
        const statusTelemetry = telemetry.values?.[statusModuleId];
        const activeEntry = statusTelemetry?.active;
        const isActive = typeof activeEntry?.value === 'boolean' ? activeEntry.value : false;

        indicator.alpha = isActive ? 1 : 0.2;
        indicator.visible = true;
      }
    },
  };
}
