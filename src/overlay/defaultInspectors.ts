import ChassisInspector from '../components/inspectors/ChassisInspector';
import InventoryInspector from '../components/inspectors/InventoryInspector';
import EntityInfoInspector from '../components/inspectors/EntityInfoInspector';
import MechanismProgrammingInspector from '../components/inspectors/MechanismProgrammingInspector';
import { getInspectorDefinitions, registerInspector } from './inspectorRegistry';

const ensureInspectorRegistered = (id: string, register: () => void): void => {
  const existing = getInspectorDefinitions().some((definition) => definition.id === id);
  if (existing) {
    return;
  }
  register();
};

export const ensureDefaultInspectorsRegistered = (): void => {
  ensureInspectorRegistered('mechanism-chassis', () => {
    registerInspector({
      id: 'mechanism-chassis',
      label: 'Chassis',
      group: 'systems',
      component: ChassisInspector,
      shouldRender: (entity) => entity.overlayType === 'complex' && Boolean(entity.chassis),
      order: 10,
    });
  });

  ensureInspectorRegistered('mechanism-inventory', () => {
    registerInspector({
      id: 'mechanism-inventory',
      label: 'Inventory',
      group: 'systems',
      component: InventoryInspector,
      shouldRender: (entity) => entity.overlayType === 'complex' && Boolean(entity.inventory),
      order: 20,
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

  ensureInspectorRegistered('mechanism-programming', () => {
    registerInspector({
      id: 'mechanism-programming',
      label: 'Programming',
      group: 'programming',
      component: MechanismProgrammingInspector,
      shouldRender: (entity) => entity.overlayType === 'complex',
      order: 50,
    });
  });
};
