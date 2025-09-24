import type { ComponentType } from 'react';
import type { EntityOverlayData, InspectorTabId } from '../types/overlay';

export interface InspectorProps {
  entity: EntityOverlayData;
  onClose: () => void;
}

export interface InspectorDefinition<TProps extends InspectorProps = InspectorProps> {
  id: string;
  label: string;
  group: InspectorTabId;
  component: ComponentType<TProps>;
  shouldRender?: (entity: EntityOverlayData) => boolean;
  order?: number;
}

const definitions = new Map<string, InspectorDefinition>();

export const registerInspector = (definition: InspectorDefinition): void => {
  if (!definition.id.trim()) {
    throw new Error('Inspector definitions require a stable identifier.');
  }
  if (definitions.has(definition.id)) {
    throw new Error(`Inspector with id "${definition.id}" already registered.`);
  }
  definitions.set(definition.id, definition);
};

export const getInspectorDefinitions = (): InspectorDefinition[] => {
  return Array.from(definitions.values()).sort((a, b) => {
    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.label.localeCompare(b.label);
  });
};

export const getInspectorsForEntity = (entity: EntityOverlayData): InspectorDefinition[] => {
  return getInspectorDefinitions().filter((definition) => {
    if (!definition.shouldRender) {
      return true;
    }
    try {
      return definition.shouldRender(entity);
    } catch (error) {
      console.error('Inspector predicate threw an error', error);
      return false;
    }
  });
};

export const resetInspectorRegistry = (): void => {
  definitions.clear();
};
