import type { MechanismChassis } from '../../mechanism';
import type { SimulationWorldComponents, TransformComponent } from '../../runtime/simulationWorld';
import type { ComponentHandle, System } from '../world';

export function createMechanismPhysicsSystem({
  MechanismCore,
  Transform,
}: Pick<SimulationWorldComponents, 'MechanismCore' | 'Transform'>): System<[
  ComponentHandle<MechanismChassis>,
  ComponentHandle<TransformComponent>,
]> {
  return {
    name: 'MechanismPhysicsSystem',
    components: [MechanismCore, Transform],
    update: (_world, entities, delta) => {
      for (const [entity, mechanism] of entities) {
        mechanism.tick(delta);
        const state = mechanism.getStateSnapshot();
        Transform.set(entity, {
          position: { x: state.position.x, y: state.position.y },
          rotation: state.orientation,
        });
      }
    },
  };
}
