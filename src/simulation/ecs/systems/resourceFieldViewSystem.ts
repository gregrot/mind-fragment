import type { Container, Renderer } from 'pixi.js';
import { ResourceLayer } from '../../resourceLayer';
import type {
  ResourceFieldViewComponent,
  SimulationWorldComponents,
} from '../../runtime/simulationWorld';
import type { ComponentHandle, QueryResult, ECSWorld } from '../world';
import type { Entity } from '../entity';
import { System } from '../system';

interface ResourceFieldViewSystemDependencies
  extends Pick<SimulationWorldComponents, 'ResourceFieldView'> {}

interface ResourceFieldViewSystemOptions {
  renderer: Renderer;
  container: Container;
}

class ResourceFieldViewSystem extends System<[ComponentHandle<ResourceFieldViewComponent>]> {
  private readonly layers = new Map<Entity, ResourceLayer>();

  constructor(
    private readonly ResourceFieldView: ComponentHandle<ResourceFieldViewComponent>,
    private readonly renderer: Renderer,
    private readonly container: Container,
  ) {
    super({ name: 'ResourceFieldViewSystem', processEmpty: true });
  }

  protected override query(world: ECSWorld) {
    return world.query.withAll(this.ResourceFieldView);
  }

  override processAll(
    world: ECSWorld,
    entities: QueryResult<[ComponentHandle<ResourceFieldViewComponent>]>[],
  ): void {
    const activeEntities = new Set<Entity>();

    for (const [entity, view] of entities) {
      activeEntities.add(entity);

      let layer = this.layers.get(entity);

      if (!layer) {
        layer = view.layer ?? new ResourceLayer(this.renderer, view.resourceField);
        this.layers.set(entity, layer);
      } else if (view.layer && view.layer !== layer) {
        this.layers.set(entity, view.layer);
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

      if (layer.view.parent !== this.container) {
        this.container.addChild(layer.view);
      }

      layer.view.zIndex = Math.min(layer.view.zIndex ?? 0, -10);
    }

    for (const [entity, layer] of this.layers.entries()) {
      if (activeEntities.has(entity) && world.hasEntity(entity) && this.ResourceFieldView.has(entity)) {
        continue;
      }

      if (layer.view.parent === this.container) {
        this.container.removeChild(layer.view);
      }

      layer.dispose();
      this.layers.delete(entity);

      const component = this.ResourceFieldView.get(entity);
      if (component) {
        component.layer = null;
      }
    }
  }
}

export function createResourceFieldViewSystem(
  { ResourceFieldView }: ResourceFieldViewSystemDependencies,
  { renderer, container }: ResourceFieldViewSystemOptions,
): ResourceFieldViewSystem {
  return new ResourceFieldViewSystem(ResourceFieldView, renderer, container);
}
