import type { RobotModule } from '../RobotModule';
import { MovementModule } from './movementModule';
import { ManipulationModule } from './manipulationModule';
import { CraftingModule } from './craftingModule';
import { ScanningModule } from './scanningModule';

export type ModuleIconVariant = 'movement' | 'manipulation' | 'crafting' | 'scanning';

export interface ModuleParameterMetadata {
  key: string;
  label: string;
  unit?: string;
  description?: string;
}

export interface ModuleActionMetadata {
  name: string;
  label: string;
  description: string;
}

export interface ModuleTelemetryMetadata {
  key: string;
  label: string;
  description: string;
}

export interface ModuleBlueprint {
  id: string;
  title: string;
  summary: string;
  icon: ModuleIconVariant;
  attachment: { slot: string; index: number };
  provides: string[];
  requires: string[];
  capacityCost: number;
  parameters: ModuleParameterMetadata[];
  actions: ModuleActionMetadata[];
  telemetry: ModuleTelemetryMetadata[];
  instantiate: () => RobotModule;
}

export const MODULE_LIBRARY: ModuleBlueprint[] = [
  {
    id: 'core.movement',
    title: 'Locomotion Thrusters Mk1',
    summary:
      'Baseline propulsion array that delivers planar movement and rotation with configurable limits.',
    icon: 'movement',
    attachment: { slot: 'core', index: 0 },
    provides: ['movement.linear', 'movement.angular'],
    requires: [],
    capacityCost: 2,
    parameters: [
      { key: 'maxLinearSpeed', label: 'Max linear speed', unit: 'units/s' },
      { key: 'maxAngularSpeed', label: 'Max rotational speed', unit: 'rad/s' },
    ],
    actions: [
      {
        name: 'setLinearVelocity',
        label: 'Set linear velocity',
        description: 'Accelerate within safe limits using the thruster gimbals.',
      },
      {
        name: 'setAngularVelocity',
        label: 'Set angular velocity',
        description: 'Reorient the chassis by applying differential thrust.',
      },
    ],
    telemetry: [
      {
        key: 'distanceTravelled',
        label: 'Distance travelled',
        description: 'Total distance covered since activation.',
      },
      {
        key: 'lastCommand',
        label: 'Last command',
        description: 'Record of the latest locomotion instruction.',
      },
    ],
    instantiate: () => new MovementModule(),
  },
  {
    id: 'arm.manipulator',
    title: 'Precision Manipulator Rig',
    summary:
      'Multi-finger actuator capable of gripping artefacts and supporting fabrication tasks.',
    icon: 'manipulation',
    attachment: { slot: 'extension', index: 0 },
    provides: ['manipulation.grip'],
    requires: [],
    capacityCost: 1,
    parameters: [
      { key: 'gripStrength', label: 'Grip strength', unit: 'kN' },
    ],
    actions: [
      {
        name: 'configureGrip',
        label: 'Configure grip strength',
        description: 'Tune the manipulator tension for the current payload.',
      },
      {
        name: 'grip',
        label: 'Grip target',
        description: 'Engage the manipulator around a named item or handle.',
      },
      {
        name: 'release',
        label: 'Release',
        description: 'Disengage the manipulator and clear the held item.',
      },
    ],
    telemetry: [
      {
        key: 'gripEngaged',
        label: 'Grip engaged',
        description: 'Indicates whether the manipulator is currently holding an item.',
      },
      {
        key: 'heldItem',
        label: 'Held item',
        description: 'Identifier for the currently gripped object.',
      },
      {
        key: 'operationsCompleted',
        label: 'Operations completed',
        description: 'Running count of successful grip cycles.',
      },
    ],
    instantiate: () => new ManipulationModule(),
  },
  {
    id: 'fabricator.basic',
    title: 'Field Fabricator',
    summary:
      'Compact assembler that queues recipes and fabricates lightweight components on demand.',
    icon: 'crafting',
    attachment: { slot: 'extension', index: 1 },
    provides: ['crafting.basic'],
    requires: ['manipulation.grip'],
    capacityCost: 2,
    parameters: [
      { key: 'defaultDuration', label: 'Default craft duration', unit: 's' },
    ],
    actions: [
      {
        name: 'queueRecipe',
        label: 'Queue recipe',
        description: 'Add a fabrication job to the queue.',
      },
      {
        name: 'cancelRecipe',
        label: 'Cancel recipe',
        description: 'Remove a pending fabrication job by identifier.',
      },
    ],
    telemetry: [
      {
        key: 'queueLength',
        label: 'Queue length',
        description: 'Number of pending fabrication jobs.',
      },
      {
        key: 'activeRecipe',
        label: 'Active recipe',
        description: 'Details of the recipe currently being built.',
      },
      {
        key: 'lastCompleted',
        label: 'Last completed',
        description: 'Most recent job that completed successfully.',
      },
    ],
    instantiate: () => new CraftingModule(),
  },
  {
    id: 'sensor.survey',
    title: 'Survey Scanner Suite',
    summary:
      'Wide-band scanner that projects survey rays to identify points of interest within range.',
    icon: 'scanning',
    attachment: { slot: 'sensor', index: 0 },
    provides: ['scanning.survey'],
    requires: [],
    capacityCost: 1,
    parameters: [
      { key: 'scanRange', label: 'Scan range', unit: 'units' },
      { key: 'cooldownSeconds', label: 'Cooldown', unit: 's' },
    ],
    actions: [
      {
        name: 'scan',
        label: 'Sweep area',
        description: 'Trigger a survey sweep along the robot orientation.',
      },
    ],
    telemetry: [
      {
        key: 'cooldownRemaining',
        label: 'Cooldown remaining',
        description: 'Seconds until the next scan can fire.',
      },
      {
        key: 'lastScan',
        label: 'Last scan',
        description: 'Result payload from the previous sweep.',
      },
    ],
    instantiate: () => new ScanningModule(),
  },
];

const MODULE_LOOKUP = MODULE_LIBRARY.reduce<Record<string, ModuleBlueprint>>((accumulator, blueprint) => {
  accumulator[blueprint.id] = blueprint;
  return accumulator;
}, {});

export const DEFAULT_MODULE_LOADOUT = ['core.movement', 'arm.manipulator', 'fabricator.basic', 'sensor.survey'];

export const getModuleBlueprint = (id: string): ModuleBlueprint | null => MODULE_LOOKUP[id] ?? null;

export const createModuleInstance = (id: string): RobotModule => {
  const blueprint = MODULE_LOOKUP[id];
  if (!blueprint) {
    throw new Error(`Unknown module id: ${id}`);
  }
  return blueprint.instantiate();
};
