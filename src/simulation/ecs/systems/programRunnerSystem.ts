import type { BlockProgramRunner } from '../../runtime/blockProgramRunner';
import type { SimulationWorldComponents } from '../../runtime/simulationWorld';
import type { ComponentHandle, System } from '../world';

export function createProgramRunnerSystem({
  ProgramRunner,
}: Pick<SimulationWorldComponents, 'ProgramRunner'>): System<[
  ComponentHandle<BlockProgramRunner>,
]> {
  return {
    name: 'ProgramRunnerSystem',
    createQuery: (world) => world.query.withAll(ProgramRunner),
    update: (_world, entities, delta) => {
      for (const [, runner] of entities) {
        runner.update(delta);
      }
    },
  };
}
