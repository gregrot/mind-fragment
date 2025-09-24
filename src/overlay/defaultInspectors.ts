import RobotProgrammingInspector from '../components/inspectors/RobotProgrammingInspector';
import { registerInspector } from './inspectorRegistry';

let hasRegistered = false;

export const ensureDefaultInspectorsRegistered = (): void => {
  if (hasRegistered) {
    return;
  }
  registerInspector({
    id: 'robot-programming',
    label: 'Programming',
    group: 'programming',
    component: RobotProgrammingInspector,
    shouldRender: (entity) => entity.overlayType === 'complex',
    order: 50,
  });
  hasRegistered = true;
};
