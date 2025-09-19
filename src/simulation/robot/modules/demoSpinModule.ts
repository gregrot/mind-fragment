import { RobotModule } from '../RobotModule';
import type { ModulePort } from '../moduleBus';
import type { ModuleUpdateContext } from '../RobotChassis';

interface DemoSpinModuleOptions {
  angularSpeed?: number;
}

export class DemoSpinModule extends RobotModule {
  private readonly angularSpeed: number;
  private port: ModulePort | null = null;

  constructor({ angularSpeed = 0.25 }: DemoSpinModuleOptions = {}) {
    super({
      id: 'demo.spin',
      title: 'Demo Spin Module',
      provides: ['demo.spin'],
      attachment: { slot: 'core', index: 0 },
      capacityCost: 0,
    });
    this.angularSpeed = angularSpeed;
  }

  override onAttach(port: ModulePort): void {
    this.port = port;
    this.port.publishValue('angularSpeed', this.angularSpeed, {
      label: 'Demo angular speed (rad/s)',
    });
  }

  override onDetach(): void {
    this.port = null;
  }

  override update({ port }: ModuleUpdateContext): void {
    const speed = port.getValue<number>('angularSpeed') ?? this.angularSpeed;
    port.requestActuator('movement.angular', { value: speed }, -10);
  }
}
