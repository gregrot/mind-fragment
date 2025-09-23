import { describe, expect, it } from 'vitest';

import {
  ECSBlackboard,
  SIMULATION_BLACKBOARD_EVENT_KEYS,
  SIMULATION_BLACKBOARD_FACT_KEYS,
  type SimulationBlackboardEvents,
  type SimulationBlackboardFacts,
  type SimulationUISignal,
} from '../ecsBlackboard';

describe('ECSBlackboard', () => {
  it('stores and retrieves facts by key', () => {
    const blackboard = new ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>();

    expect(
      blackboard.getFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus),
    ).toBeUndefined();

    blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus, 'running');
    expect(blackboard.getFact(SIMULATION_BLACKBOARD_FACT_KEYS.ProgramStatus)).toBe('running');
  });

  it('updates facts using updater functions', () => {
    const blackboard = new ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>();

    blackboard.updateFact(SIMULATION_BLACKBOARD_FACT_KEYS.CurrentUISignal, () => null);
    blackboard.updateFact(SIMULATION_BLACKBOARD_FACT_KEYS.CurrentUISignal, () => ({
      type: 'status-indicator',
      payload: { active: true },
    } satisfies SimulationUISignal));

    expect(blackboard.getFact(SIMULATION_BLACKBOARD_FACT_KEYS.CurrentUISignal)).toEqual({
      type: 'status-indicator',
      payload: { active: true },
    });
  });

  it('queues and consumes events in order', () => {
    const blackboard = new ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>();

    blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.SelectionChanged, 'MF-01');
    blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.SelectionChanged, null);

    const events = blackboard.consumeEvents(SIMULATION_BLACKBOARD_EVENT_KEYS.SelectionChanged);
    expect(events).toEqual(['MF-01', null]);
    expect(blackboard.consumeEvents(SIMULATION_BLACKBOARD_EVENT_KEYS.SelectionChanged)).toEqual([]);
  });

  it('allows peeking at event queues without clearing them', () => {
    const blackboard = new ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>();

    blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.ProgramStatusChanged, 'idle');
    const peeked = blackboard.peekEvents(SIMULATION_BLACKBOARD_EVENT_KEYS.ProgramStatusChanged);
    expect(peeked).toEqual(['idle']);
    expect(
      blackboard.consumeEvents(SIMULATION_BLACKBOARD_EVENT_KEYS.ProgramStatusChanged),
    ).toEqual(['idle']);
  });

  it('clears events and facts independently', () => {
    const blackboard = new ECSBlackboard<SimulationBlackboardFacts, SimulationBlackboardEvents>();

    blackboard.setFact(SIMULATION_BLACKBOARD_FACT_KEYS.SelectedRobotId, 'MF-01');
    blackboard.publishEvent(SIMULATION_BLACKBOARD_EVENT_KEYS.TelemetryUpdated, {
      values: {},
      actions: {},
    });

    blackboard.clearEvents(SIMULATION_BLACKBOARD_EVENT_KEYS.TelemetryUpdated);
    expect(blackboard.consumeEvents(SIMULATION_BLACKBOARD_EVENT_KEYS.TelemetryUpdated)).toEqual([]);

    blackboard.clear();
    expect(blackboard.getFact(SIMULATION_BLACKBOARD_FACT_KEYS.SelectedRobotId)).toBeUndefined();
  });
});
