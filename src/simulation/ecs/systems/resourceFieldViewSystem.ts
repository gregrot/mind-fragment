import type { Container, Renderer } from 'pixi.js';
import { ResourceLayer } from '../../resourceLayer';
import type {
  ResourceFieldViewComponent,
  SimulationWorldComponents,
} from '../../runtime/simulationWorld';
import type { ComponentHandle, System } from '../world';
import type { Entity } from '../entity';

interface ResourceFieldViewSystemDependencies
  extends Pick<SimulationWorldComponents, 'ResourceFieldView'> {}

interface ResourceFieldViewSystemOptions {
  renderer: Renderer;
  container: Container;
}

export function createResourceFieldViewSystem(
  { ResourceFieldView }: ResourceFieldViewSystemDependencies,
  { renderer, container }: ResourceFieldViewSystemOptions,
): System<[ComponentHandle<ResourceFieldViewComponent>]> {
  const layers = new Map<Entity, ResourceLayer>();

  return {
    name: 'ResourceFieldViewSystem',
    components: [ResourceFieldView],
    update: (world, entities) => {
      const activeEntities = new Set<Entity>();

      for (const [entity, view] of entities) {
        activeEntities.add(entity);

        let layer = layers.get(entity);

        if (!layer) {
          layer = view.layer ?? new ResourceLayer(renderer, view.resourceField);
          layers.set(entity, layer);
        } else if (view.layer && view.layer !== layer) {
          layers.set(entity, view.layer);
          if (layer !== view.layer) {
            if (layer.view.parent) {
              layer.view.parent.removeChild(layer.view);
            }
            layer.dispose();
          }
          layer = view.layer;
        }

        if (view.layer !== layer) {
          view.layer = layer;
        }

        if (layer.view.parent !== container) {
          container.addChild(layer.view);
        }

        layer.view.zIndex = Math.min(layer.view.zIndex ?? 0, -10);
      }

      for (const [entity, layer] of layers.entries()) {
        if (activeEntities.has(entity) && world.hasEntity(entity) && ResourceFieldView.has(entity)) {
          continue;
        }

        if (layer.view.parent === container) {
          container.removeChild(layer.view);
        }

        layer.dispose();
        layers.delete(entity);

        const component = ResourceFieldView.get(entity);
        if (component) {
          component.layer = null;
        }
      }
    },
  };
}
