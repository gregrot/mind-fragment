const TWO_PI = Math.PI * 2;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const normaliseAngle = (angle: number): number => {
  if (!Number.isFinite(angle)) {
    return 0;
  }

  let result = angle % TWO_PI;
  if (result <= -Math.PI) {
    result += TWO_PI;
  } else if (result > Math.PI) {
    result -= TWO_PI;
  }
  return result;
};

export interface Vector2 {
  x: number;
  y: number;
}

export interface ResourcePool {
  current: number;
  max: number;
}

export interface MechanismStateSnapshot {
  position: Vector2;
  orientation: number;
  velocity: {
    linear: Vector2;
    angular: number;
  };
  energy: ResourcePool;
  heat: ResourcePool;
}

export interface MechanismStateOptions {
  position?: Partial<Vector2>;
  orientation?: number;
  velocity?: {
    linear?: Partial<Vector2>;
    angular?: number;
  };
  energy?: Partial<ResourcePool>;
  heat?: Partial<ResourcePool>;
}

export class MechanismState {
  private readonly position: Vector2;
  private orientation: number;
  private readonly velocity: {
    linear: Vector2;
    angular: number;
  };
  private readonly energy: ResourcePool;
  private readonly heat: ResourcePool;

  constructor({
    position = { x: 0, y: 0 },
    orientation = 0,
    velocity = { linear: { x: 0, y: 0 }, angular: 0 },
    energy = { current: 100, max: 100 },
    heat = { current: 0, max: 100 },
  }: MechanismStateOptions = {}) {
    this.position = { x: position.x ?? 0, y: position.y ?? 0 };
    this.orientation = normaliseAngle(orientation ?? 0);
    this.velocity = {
      linear: {
        x: velocity?.linear?.x ?? 0,
        y: velocity?.linear?.y ?? 0,
      },
      angular: velocity?.angular ?? 0,
    };
    this.energy = {
      current: clamp(energy?.current ?? 0, 0, energy?.max ?? 0),
      max: Math.max(energy?.max ?? 0, 0),
    };
    this.heat = {
      current: clamp(heat?.current ?? 0, 0, heat?.max ?? 0),
      max: Math.max(heat?.max ?? 0, 0),
    };
  }

  setLinearVelocity(x: number, y: number): void {
    this.velocity.linear.x = Number.isFinite(x) ? x : 0;
    this.velocity.linear.y = Number.isFinite(y) ? y : 0;
  }

  setAngularVelocity(value: number): void {
    this.velocity.angular = Number.isFinite(value) ? value : 0;
  }

  applyEnergy(delta: number): void {
    const next = this.energy.current + delta;
    this.energy.current = clamp(next, 0, this.energy.max);
  }

  applyHeat(delta: number): void {
    const next = this.heat.current + delta;
    this.heat.current = clamp(next, 0, this.heat.max);
  }

  integrate(stepSeconds: number): void {
    this.position.x += this.velocity.linear.x * stepSeconds;
    this.position.y += this.velocity.linear.y * stepSeconds;
    this.orientation = normaliseAngle(this.orientation + this.velocity.angular * stepSeconds);
  }

  getSnapshot(): MechanismStateSnapshot {
    return {
      position: { ...this.position },
      orientation: this.orientation,
      velocity: {
        linear: { ...this.velocity.linear },
        angular: this.velocity.angular,
      },
      energy: { ...this.energy },
      heat: { ...this.heat },
    };
  }
}

export const mechanismStateUtils = { normaliseAngle };
