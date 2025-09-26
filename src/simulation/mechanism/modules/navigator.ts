import type { MechanismStateSnapshot, Vector2 } from '../mechanismState';
import { mechanismStateUtils } from '../mechanismState';

export interface SimpleNavigatorOptions {
  alignmentTolerance?: number;
  angularGain?: number;
  maxAngularSpeed?: number;
  arrivalRadius?: number;
}

export interface SteeringCommand {
  headingError: number;
  distance: number;
  aligned: boolean;
  angularVelocity: number;
  linearVelocity: Vector2;
}

export class SimpleNavigator {
  private readonly alignmentTolerance: number;
  private readonly angularGain: number;
  private readonly maxAngularSpeed: number;
  private readonly arrivalRadius: number;

  constructor({
    alignmentTolerance = Math.PI / 32,
    angularGain = 4,
    maxAngularSpeed = Math.PI / 2,
    arrivalRadius = 4,
  }: SimpleNavigatorOptions = {}) {
    this.alignmentTolerance = Math.max(alignmentTolerance, 0.001);
    this.angularGain = Math.max(angularGain, 0);
    this.maxAngularSpeed = Math.max(maxAngularSpeed, 0.1);
    this.arrivalRadius = Math.max(arrivalRadius, 0);
  }

  steerTowards(state: MechanismStateSnapshot, target: Vector2, desiredSpeed: number): SteeringCommand {
    const dx = target.x - state.position.x;
    const dy = target.y - state.position.y;
    const distance = Math.hypot(dx, dy);

    if (!Number.isFinite(distance) || distance <= 0) {
      return {
        headingError: 0,
        distance: 0,
        aligned: true,
        angularVelocity: 0,
        linearVelocity: { x: 0, y: 0 },
      } satisfies SteeringCommand;
    }

    const desiredHeading = Math.atan2(dy, dx);
    const headingError = mechanismStateUtils.normaliseAngle(desiredHeading - state.orientation);
    const aligned = Math.abs(headingError) <= this.alignmentTolerance;
    const withinArrival = distance <= this.arrivalRadius;

    const safeDesiredSpeed = Number.isFinite(desiredSpeed) ? Math.max(desiredSpeed, 0) : 0;

    let angularVelocity = 0;
    let linearVelocity: Vector2 = { x: 0, y: 0 };

    if (!withinArrival) {
      if (!aligned) {
        angularVelocity = this.calculateAngularVelocity(headingError);
      } else if (safeDesiredSpeed > 0) {
        const speed = Math.min(safeDesiredSpeed, distance);
        linearVelocity = {
          x: Math.cos(state.orientation) * speed,
          y: Math.sin(state.orientation) * speed,
        } satisfies Vector2;
      }
    }

    return {
      headingError,
      distance,
      aligned,
      angularVelocity,
      linearVelocity,
    } satisfies SteeringCommand;
  }

  private calculateAngularVelocity(headingError: number): number {
    if (!Number.isFinite(headingError) || headingError === 0) {
      return 0;
    }
    const requested = headingError * this.angularGain;
    if (!Number.isFinite(requested) || requested === 0) {
      return 0;
    }
    const bounded = Math.max(Math.min(requested, this.maxAngularSpeed), -this.maxAngularSpeed);
    return bounded;
  }
}
