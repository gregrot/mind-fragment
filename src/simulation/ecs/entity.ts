import type { ComponentHandle } from './world';
import { Signal } from './signal';

export interface ComponentRecord<TValue = unknown> {
  component: ComponentHandle<TValue>;
  value: TValue;
}

export interface ComponentAddedPayload<TValue = unknown> extends ComponentRecord<TValue> {
  entity: Entity;
}

export interface ComponentChangedPayload<TValue = unknown> extends ComponentAddedPayload<TValue> {
  previous: TValue;
}

export interface ComponentRemovedPayload<TValue = unknown> {
  entity: Entity;
  component: ComponentHandle<TValue>;
  previous: TValue;
}

export interface EnabledChangedPayload {
  entity: Entity;
  enabled: boolean;
}

export interface ParentChangedPayload {
  entity: Entity;
  previous: Entity | null;
  next: Entity | null;
}

export interface ChildPayload {
  entity: Entity;
  child: Entity;
}

export interface EntityHost {
  attachComponent<TValue>(entity: Entity, component: ComponentHandle<TValue>, value: TValue): void;
  detachComponent<TValue>(entity: Entity, component: ComponentHandle<TValue>): void;
  destroyEntity(entity: Entity): void;
}

export class Entity {
  readonly componentAdded = new Signal<ComponentAddedPayload>();
  readonly componentChanged = new Signal<ComponentChangedPayload>();
  readonly componentRemoved = new Signal<ComponentRemovedPayload>();
  readonly enabledChanged = new Signal<EnabledChangedPayload>();
  readonly parentChanged = new Signal<ParentChangedPayload>();
  readonly childAdded = new Signal<ChildPayload>();
  readonly childRemoved = new Signal<ChildPayload>();
  readonly destroyed = new Signal<Entity>();

  private readonly componentMap = new Map<symbol, ComponentRecord>();
  private _enabled = true;
  private _destroyed = false;
  private _parent: Entity | null = null;
  private readonly _children = new Set<Entity>();

  constructor(private readonly host: EntityHost, readonly id: number) {}

  get enabled(): boolean {
    return this._enabled;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  get parent(): Entity | null {
    return this._parent;
  }

  get children(): ReadonlySet<Entity> {
    return this._children;
  }

  addComponent<TValue>(component: ComponentHandle<TValue>, value: TValue): void {
    this.assertAlive('add components');
    this.host.attachComponent(this, component, value);
  }

  setComponent<TValue>(component: ComponentHandle<TValue>, value: TValue): void {
    this.addComponent(component, value);
  }

  removeComponent(component: ComponentHandle<unknown>): void {
    this.assertAlive('remove components');
    this.host.detachComponent(this, component);
  }

  hasComponent(component: ComponentHandle<unknown>): boolean {
    return this.componentMap.has(component.id);
  }

  getComponent<TValue>(component: ComponentHandle<TValue>): TValue | undefined {
    return this.componentMap.get(component.id)?.value as TValue | undefined;
  }

  enable(): void {
    this.setEnabled(true);
  }

  disable(): void {
    this.setEnabled(false);
  }

  setEnabled(enabled: boolean): void {
    this.assertAlive('toggle enabled state');
    if (this._enabled === enabled) {
      return;
    }
    this._enabled = enabled;
    this.enabledChanged.emit({ entity: this, enabled });
  }

  setParent(next: Entity | null): void {
    this.assertAlive('change parent');
    if (next === this) {
      throw new Error('An entity cannot be its own parent.');
    }
    if (next && next.host !== this.host) {
      throw new Error('Parent must belong to the same world.');
    }
    if (next && next.isDescendantOf(this)) {
      throw new Error('Cannot parent an entity to its descendant.');
    }
    if (this._parent === next) {
      return;
    }

    const previous = this._parent;
    if (previous) {
      previous._children.delete(this);
      previous.childRemoved.emit({ entity: previous, child: this });
    }

    this._parent = next;

    if (next) {
      next._children.add(this);
      next.childAdded.emit({ entity: next, child: this });
    }

    this.parentChanged.emit({ entity: this, previous, next });
  }

  addChild(child: Entity): void {
    child.setParent(this);
  }

  removeChild(child: Entity): void {
    if (child.parent !== this) {
      return;
    }
    child.setParent(null);
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this.host.destroyEntity(this);
  }

  /** @internal */
  receiveComponentSet<TValue>(
    component: ComponentHandle<TValue>,
    value: TValue,
    previous: TValue | undefined,
    hadPrevious: boolean,
  ): void {
    const record: ComponentRecord<TValue> = { component, value };
    this.componentMap.set(component.id, record);
    if (hadPrevious) {
      this.componentChanged.emit({
        entity: this,
        component,
        value,
        previous: previous as TValue,
      });
    } else {
      this.componentAdded.emit({ entity: this, component, value });
    }
  }

  /** @internal */
  receiveComponentRemoval<TValue>(component: ComponentHandle<TValue>, previous: TValue): void {
    this.componentMap.delete(component.id);
    this.componentRemoved.emit({ entity: this, component, previous });
  }

  /** @internal */
  markDestroyed(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    this.destroyed.emit(this);
    this.destroyed.clear();
    this.componentAdded.clear();
    this.componentChanged.clear();
    this.componentRemoved.clear();
    this.enabledChanged.clear();
    this.parentChanged.clear();
    this.childAdded.clear();
    this.childRemoved.clear();
    this.componentMap.clear();
    this._children.clear();
    this._parent = null;
  }

  /** @internal */
  isOwnedBy(host: EntityHost): boolean {
    return this.host === host;
  }

  /** @internal */
  *iterateComponents(): IterableIterator<ComponentRecord> {
    for (const record of this.componentMap.values()) {
      yield record;
    }
  }

  private isDescendantOf(target: Entity): boolean {
    let current: Entity | null = this._parent;
    while (current) {
      if (current === target) {
        return true;
      }
      current = current._parent;
    }
    return false;
  }

  private assertAlive(action: string): void {
    if (this._destroyed) {
      throw new Error(`Cannot ${action} on a destroyed entity.`);
    }
  }
}
