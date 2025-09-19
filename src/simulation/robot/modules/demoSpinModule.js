import { RobotModule } from '../RobotModule.js';

export class DemoSpinModule extends RobotModule {
  constructor({ angularSpeed = 0.25 } = {}) {
    super({
      id: 'demo.spin',
      title: 'Demo Spin Module',
      provides: ['demo.spin'],
      attachment: { slot: 'core', index: 0 },
      capacityCost: 0,
    });
    this.angularSpeed = angularSpeed;
  }

  onAttach(port) {
    this.port = port;
    this.port.publishValue('angularSpeed', this.angularSpeed, {
      label: 'Demo angular speed (rad/s)',
    });
  }

  update({ port }) {
    const speed = port.getValue('angularSpeed') ?? this.angularSpeed;
    port.requestActuator('movement.angular', { value: speed }, -10);
  }
}
