import type { MechanismChassis } from '../../mechanism';
import type { SimulationWorldComponents, TransformComponent } from '../../runtime/simulationWorld';
import type { ComponentHandle, QueryResult, ECSWorld } from '../world';
import { System } from '../system';

class MechanismPhysicsSystem extends System<[
  ComponentHandle<MechanismChassis>,
  ComponentHandle<TransformComponent>,
]> {
  constructor(
    private readonly MechanismCore: ComponentHandle<MechanismChassis>,
    private readonly Transform: ComponentHandle<TransformComponent>,
  ) {
    super({ name: 'MechanismPhysicsSystem' });
  }

  protected override query(world: ECSWorld) {
    return world.query.withAll(this.MechanismCore, this.Transform);
  }

  override process(
    [entity, mechanism]: QueryResult<[
      ComponentHandle<MechanismChassis>,
      ComponentHandle<TransformComponent>,
    ]>,
    delta: number,
    _world: ECSWorld,
  ): void {
    mechanism.tick(delta);
    const state = mechanism.getStateSnapshot();
    this.Transform.set(entity, {
      position: { x: state.position.x, y: state.position.y },
      rotation: state.orientation,
    });
  }
}

export function createMechanismPhysicsSystem({
  MechanismCore,
  Transform,
}: Pick<SimulationWorldComponents, 'MechanismCore' | 'Transform'>): MechanismPhysicsSystem {
  return new MechanismPhysicsSystem(MechanismCore, Transform);
}
