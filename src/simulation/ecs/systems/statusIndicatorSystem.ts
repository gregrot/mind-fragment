import type { SimulationWorldComponents, StatusIndicatorComponent } from '../../runtime/simulationWorld';
import type { MechanismChassis } from '../../mechanism';
import type { ComponentHandle, QueryResult, ECSWorld } from '../world';
import { System } from '../system';

interface StatusIndicatorSystemDependencies
  extends Pick<SimulationWorldComponents, 'MechanismCore' | 'StatusIndicator'> {}

interface StatusIndicatorSystemOptions {
  statusModuleId: string;
}

class StatusIndicatorSystem extends System<[
  ComponentHandle<MechanismChassis>,
  ComponentHandle<StatusIndicatorComponent>,
]> {
  constructor(
    private readonly MechanismCore: ComponentHandle<MechanismChassis>,
    private readonly StatusIndicator: ComponentHandle<StatusIndicatorComponent>,
    private readonly statusModuleId: string,
  ) {
    super({ name: 'StatusIndicatorSystem' });
  }

  protected override query(world: ECSWorld) {
    return world.query.withAll(this.MechanismCore, this.StatusIndicator);
  }

  override process(
    [
      ,
      mechanismCore,
      { indicator },
    ]: QueryResult<[
      ComponentHandle<MechanismChassis>,
      ComponentHandle<StatusIndicatorComponent>,
    ]>,
    _delta: number,
    _world: ECSWorld,
  ): void {
    const hasStatusModule = Boolean(mechanismCore.moduleStack.getModule(this.statusModuleId));

    if (!hasStatusModule) {
      indicator.visible = false;
      return;
    }

    const telemetry = mechanismCore.getTelemetrySnapshot();
    const statusTelemetry = telemetry.values?.[this.statusModuleId];
    const activeEntry = statusTelemetry?.active;
    const isActive = typeof activeEntry?.value === 'boolean' ? activeEntry.value : false;

    indicator.alpha = isActive ? 1 : 0.2;
    indicator.visible = true;
  }
}

export function createStatusIndicatorSystem(
  { MechanismCore, StatusIndicator }: StatusIndicatorSystemDependencies,
  { statusModuleId }: StatusIndicatorSystemOptions,
): StatusIndicatorSystem {
  return new StatusIndicatorSystem(MechanismCore, StatusIndicator, statusModuleId);
}
