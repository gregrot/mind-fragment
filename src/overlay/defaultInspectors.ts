import ChassisInspector from '../components/inspectors/ChassisInspector';
import EntityInfoInspector from '../components/inspectors/EntityInfoInspector';
import RobotProgrammingInspector from '../components/inspectors/RobotProgrammingInspector';
import { getInspectorDefinitions, registerInspector } from './inspectorRegistry';

const ensureInspectorRegistered = (id: string, register: () => void): void => {
  const existing = getInspectorDefinitions().some((definition) => definition.id === id);
  if (existing) {
    return;
  }
  register();
};

export const ensureDefaultInspectorsRegistered = (): void => {
  ensureInspectorRegistered('robot-chassis', () => {
    registerInspector({
      id: 'robot-chassis',
      label: 'Chassis',
      group: 'systems',
      component: ChassisInspector,
      shouldRender: (entity) => entity.overlayType === 'complex' && Boolean(entity.chassis),
      order: 10,
    });
  });

  ensureInspectorRegistered('entity-info', () => {
    registerInspector({
      id: 'entity-info',
      label: 'Overview',
      group: 'info',
      component: EntityInfoInspector,
      order: 10,
    });
  });

  ensureInspectorRegistered('robot-programming', () => {
    registerInspector({
      id: 'robot-programming',
      label: 'Programming',
      group: 'programming',
      component: RobotProgrammingInspector,
      shouldRender: (entity) => entity.overlayType === 'complex',
      order: 50,
    });
  });
};
