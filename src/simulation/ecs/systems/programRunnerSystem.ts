import type { BlockProgramRunner } from '../../runtime/blockProgramRunner';
import type { SimulationWorldComponents } from '../../runtime/simulationWorld';
import type { ComponentHandle, QueryResult, ECSWorld } from '../world';
import { System } from '../system';

class ProgramRunnerSystem extends System<[ComponentHandle<BlockProgramRunner>]> {
  constructor(private readonly ProgramRunner: ComponentHandle<BlockProgramRunner>) {
    super({ name: 'ProgramRunnerSystem' });
  }

  protected override query(world: ECSWorld) {
    return world.query.withAll(this.ProgramRunner);
  }

  override process(
    [, runner]: QueryResult<[ComponentHandle<BlockProgramRunner>]>,
    delta: number,
    _world: ECSWorld,
  ): void {
    runner.update(delta);
  }
}

export function createProgramRunnerSystem({
  ProgramRunner,
}: Pick<SimulationWorldComponents, 'ProgramRunner'>): ProgramRunnerSystem {
  return new ProgramRunnerSystem(ProgramRunner);
}
