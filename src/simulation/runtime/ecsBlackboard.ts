import type { ProgramRunnerStatus } from './blockProgramRunner';
import type { RobotChassis } from '../robot';

export interface SimulationUISignal {
  type: string;
  payload?: Record<string, unknown>;
}

export type SimulationTelemetrySnapshot = ReturnType<RobotChassis['getTelemetrySnapshot']>;

export const SIMULATION_BLACKBOARD_FACT_KEYS = {
  ProgramStatus: 'program.status',
  SelectedRobotId: 'selection.activeRobotId',
  TelemetrySnapshot: 'telemetry.latest',
  CurrentUISignal: 'ui.signal.current',
} as const;

export const SIMULATION_BLACKBOARD_EVENT_KEYS = {
  ProgramStatusChanged: 'program.status.changed',
  SelectionChanged: 'selection.changed',
  TelemetryUpdated: 'telemetry.updated',
  UISignalEmitted: 'ui.signal',
} as const;

type BlackboardEventPayload<TEvents extends Record<string, unknown[]>, TKey extends keyof TEvents> = TEvents[TKey] extends Array<
  infer TPayload
>
  ? TPayload
  : never;

export interface SimulationBlackboardFacts extends Record<string, unknown> {
  [SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus]: ProgramRunnerStatus;
  [SIMULATION_BLACKBOARD_FACT_KEYS.SelectedRobotId]: string | null;
  [SIMULATION_BLACKBOARD_FACT_KEYS.TelemetrySnapshot]: SimulationTelemetrySnapshot | null;
  [SIMULATION_BLACKBOARD_FACT_KEYS.CurrentUISignal]: SimulationUISignal | null;
}

export interface SimulationBlackboardEvents extends Record<string, unknown[]> {
  [SIMULATION_BLACKBOARD_EVENT_KEYS.ProgramStatusChanged]: ProgramRunnerStatus[];
  [SIMULATION_BLACKBOARD_EVENT_KEYS.SelectionChanged]: Array<string | null>;
  [SIMULATION_BLACKBOARD_EVENT_KEYS.TelemetryUpdated]: SimulationTelemetrySnapshot[];
  [SIMULATION_BLACKBOARD_EVENT_KEYS.UISignalEmitted]: SimulationUISignal[];
}

export class ECSBlackboard<
  TFacts extends Record<string, unknown>,
  TEvents extends Record<string, unknown[]> = Record<string, unknown[]>,
> {
  private readonly facts = new Map<string, unknown>();
  private readonly events = new Map<string, unknown[]>();

  setFact<TKey extends keyof TFacts & string>(key: TKey, value: TFacts[TKey]): void {
    this.facts.set(key, value);
  }

  getFact<TKey extends keyof TFacts & string>(key: TKey): TFacts[TKey] | undefined {
    return this.facts.get(key) as TFacts[TKey] | undefined;
  }

  hasFact<TKey extends keyof TFacts & string>(key: TKey): boolean {
    return this.facts.has(key);
  }

  removeFact<TKey extends keyof TFacts & string>(key: TKey): void {
    this.facts.delete(key);
  }

  updateFact<TKey extends keyof TFacts & string>(
    key: TKey,
    updater: (current: TFacts[TKey] | undefined) => TFacts[TKey],
  ): void {
    const nextValue = updater(this.getFact(key));
    this.setFact(key, nextValue);
  }

  publishEvent<TKey extends keyof TEvents & string>(
    key: TKey,
    payload: BlackboardEventPayload<TEvents, TKey>,
  ): void {
    const queueKey = key;
    const existing = this.events.get(queueKey) as BlackboardEventPayload<TEvents, TKey>[] | undefined;
    if (existing) {
      existing.push(payload);
      return;
    }
    this.events.set(queueKey, [payload]);
  }

  peekEvents<TKey extends keyof TEvents & string>(key: TKey): readonly BlackboardEventPayload<TEvents, TKey>[] {
    const queueKey = key;
    const existing = this.events.get(queueKey) as BlackboardEventPayload<TEvents, TKey>[] | undefined;
    return existing ? existing.slice() : [];
  }

  consumeEvents<TKey extends keyof TEvents & string>(key: TKey): BlackboardEventPayload<TEvents, TKey>[] {
    const queueKey = key;
    const existing = this.events.get(queueKey) as BlackboardEventPayload<TEvents, TKey>[] | undefined;
    if (!existing) {
      return [];
    }
    this.events.delete(queueKey);
    return existing;
  }

  clearEvents<TKey extends keyof TEvents & string>(key: TKey): void {
    this.events.delete(key);
  }

  clear(): void {
    this.facts.clear();
    this.events.clear();
  }
}
