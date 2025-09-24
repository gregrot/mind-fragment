import type { RobotChassis } from '../../robot';
import type { SimulationWorldComponents, TransformComponent } from '../../runtime/simulationWorld';
import type { ComponentHandle, System } from '../world';

export function createRobotPhysicsSystem({
  RobotCore,
  Transform,
}: Pick<SimulationWorldComponents, 'RobotCore' | 'Transform'>): System<[
  ComponentHandle<RobotChassis>,
  ComponentHandle<TransformComponent>,
]> {
  return {
    name: 'RobotPhysicsSystem',
    components: [RobotCore, Transform],
    update: (_world, entities, delta) => {
      for (const [entity, robot] of entities) {
        robot.tick(delta);
        const state = robot.getStateSnapshot();
        Transform.set(entity, {
          position: { x: state.position.x, y: state.position.y },
          rotation: state.orientation,
        });
      }
    },
  };
}
