import type { Viewport } from 'pixi-viewport';
import type { Container, Sprite } from 'pixi.js';

import type {
  DebugOverlayComponent,
  SimulationWorldComponents,
} from '../../runtime/simulationWorld';
import {
  DEBUG_BACKGROUND_COLOUR,
  DEBUG_CORNER_RADIUS,
  DEBUG_MAX_WIDTH,
  DEBUG_MIN_WIDTH,
  DEBUG_PADDING,
  DEBUG_VERTICAL_OFFSET,
} from '../../runtime/simulationWorld';
import type { BlockInstruction } from '../../runtime/blockProgram';
import type {
  ProgramDebugFrame,
  ProgramDebugState,
} from '../../runtime/blockProgramRunner';
import type { BlockProgramRunner } from '../../runtime/blockProgramRunner';
import type { RobotChassis } from '../../robot';
import type { ComponentHandle, EntityId, System } from '../world';

interface DebugOverlaySystemDependencies
  extends Pick<
    SimulationWorldComponents,
    'RobotCore' | 'ProgramRunner' | 'SpriteRef' | 'DebugOverlay'
  > {}

interface DebugOverlaySystemOptions {
  overlayLayer: Container;
  viewport: Viewport;
}

type TelemetrySnapshot = ReturnType<RobotChassis['getTelemetrySnapshot']>;

export function createDebugOverlaySystem(
  { RobotCore, ProgramRunner, SpriteRef, DebugOverlay }: DebugOverlaySystemDependencies,
  { overlayLayer, viewport }: DebugOverlaySystemOptions,
): System<[
  ComponentHandle<RobotChassis>,
  ComponentHandle<BlockProgramRunner>,
  ComponentHandle<Sprite>,
  ComponentHandle<DebugOverlayComponent>,
]> {
  return {
    name: 'DebugOverlaySystem',
    components: [RobotCore, ProgramRunner, SpriteRef, DebugOverlay],
    update: (_world, entities) => {
      const processed = new Set<EntityId>();

      for (const [entity, overlay] of DebugOverlay.entries()) {
        overlay.container.visible = false;
        if (!overlay.container.destroyed && overlay.container.parent !== overlayLayer) {
          overlayLayer.addChild(overlay.container);
        }
        processed.add(entity);
      }

      for (const [entity, robotCore, programRunner, sprite, overlay] of entities) {
        processed.delete(entity);
        updateDebugOverlay({
          overlay,
          robotCore,
          programRunner,
          sprite,
          viewport,
        });
      }

      for (const entity of processed) {
        const overlay = DebugOverlay.get(entity);
        if (!overlay) {
          continue;
        }
        overlay.lastRenderedText = '';
      }
    },
  };
}

interface UpdateDebugOverlayOptions {
  overlay: DebugOverlayComponent;
  robotCore: RobotChassis;
  programRunner: BlockProgramRunner;
  sprite: Sprite;
  viewport: Viewport;
}

function updateDebugOverlay({ overlay, robotCore, programRunner, sprite, viewport }: UpdateDebugOverlayOptions): void {
  const programDebug = programRunner.getDebugState();
  const telemetry = robotCore.getTelemetrySnapshot();

  const lines: string[] = [];
  const programLines = describeProgramDebug(programDebug);
  if (programLines.length > 0) {
    lines.push(...programLines);
  }

  const telemetryLines = describeTelemetry(telemetry);
  if (telemetryLines.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...telemetryLines);
  }

  if (lines.length === 0) {
    overlay.container.visible = false;
    overlay.lastRenderedText = '';
    return;
  }

  const textContent = lines.join('\n');
  if (textContent !== overlay.lastRenderedText) {
    overlay.text.text = textContent;
    overlay.lastRenderedText = textContent;
  }

  const padding = DEBUG_PADDING;
  const wordWrapWidth = DEBUG_MAX_WIDTH - DEBUG_PADDING * 2;
  if (overlay.text.style) {
    overlay.text.style.wordWrap = true;
    overlay.text.style.wordWrapWidth = wordWrapWidth;
  }

  const textWidth = overlay.text.width;
  const textHeight = overlay.text.height;
  const backgroundWidth = Math.max(Math.min(textWidth + padding * 2, DEBUG_MAX_WIDTH), DEBUG_MIN_WIDTH);
  const backgroundHeight = textHeight + padding * 2;

  overlay.background.clear();
  overlay.background.roundRect(
    -backgroundWidth / 2,
    -DEBUG_VERTICAL_OFFSET - backgroundHeight,
    backgroundWidth,
    backgroundHeight,
    DEBUG_CORNER_RADIUS,
  );
  overlay.background.fill({ color: DEBUG_BACKGROUND_COLOUR, alpha: 0.9 });
  overlay.background.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.35 });
  overlay.background.stroke();

  overlay.text.anchor.set(0.5, 0);
  overlay.text.position.set(0, -DEBUG_VERTICAL_OFFSET - backgroundHeight + padding);

  overlay.container.position.set(sprite.position.x, sprite.position.y);

  const scaleX = viewport.scale.x || 1;
  const scaleY = viewport.scale.y || 1;
  overlay.container.scale.set(1 / scaleX, 1 / scaleY);
  overlay.container.visible = true;
}

function describeProgramDebug(state: ProgramDebugState | null): string[] {
  if (!state) {
    return [];
  }

  const lines: string[] = [];
  if (state.program) {
    const totalSteps = countProgramInstructions(state.program.instructions);
    const plural = totalSteps === 1 ? 'step' : 'steps';
    lines.push(`Program: ${state.status.toUpperCase()} • ${totalSteps} ${plural}`);
  } else {
    lines.push(`Program: ${state.status.toUpperCase()}`);
  }

  if (state.currentInstruction) {
    const description = formatInstruction(state.currentInstruction);
    const timeRemaining = Math.max(state.timeRemaining, 0).toFixed(1);
    lines.push(`Current: ${description} • ${timeRemaining}s`);
  } else {
    lines.push('Current: —');
  }

  if (state.frames.length > 0) {
    const frameDescription = state.frames.map((frame) => formatDebugFrame(frame)).join(' ▸ ');
    lines.push(`Stack: ${frameDescription}`);
  } else {
    lines.push('Stack: —');
  }

  return lines;
}

function formatDebugFrame(frame: ProgramDebugFrame): string {
  if (frame.length <= 0) {
    return frame.kind === 'sequence' ? 'seq —' : 'loop —';
  }
  const label = frame.kind === 'sequence' ? 'seq' : 'loop';
  const index = Math.min(Math.max(frame.index, 0), frame.length - 1) + 1;
  return `${label} ${index}/${frame.length}`;
}

function describeTelemetry(snapshot: TelemetrySnapshot): string[] {
  const lines: string[] = [];
  const moduleIds = new Set([
    ...Object.keys(snapshot.values ?? {}),
    ...Object.keys(snapshot.actions ?? {}),
  ]);

  if (moduleIds.size === 0) {
    lines.push('ECS telemetry: —');
    return lines;
  }

  lines.push('ECS telemetry:');
  for (const moduleId of [...moduleIds].sort()) {
    lines.push(`- ${moduleId}`);
    const values = snapshot.values[moduleId] ?? {};
    const valueKeys = Object.keys(values).sort();
    if (valueKeys.length > 0) {
      for (const key of valueKeys) {
        const entry = values[key];
        lines.push(`    ${key}: ${formatTelemetryValue(entry.value)}`);
      }
    }

    const actions = snapshot.actions[moduleId] ?? {};
    const actionNames = Object.keys(actions).sort();
    if (actionNames.length > 0) {
      lines.push(`    actions: ${actionNames.join(', ')}`);
    }

    if (valueKeys.length === 0 && actionNames.length === 0) {
      lines.push('    (no signals)');
    }
  }

  return lines;
}

function formatInstruction(instruction: BlockInstruction): string {
  switch (instruction.kind) {
    case 'move':
      return `move • speed ${instruction.speed.toFixed(0)} • ${instruction.duration.toFixed(1)}s`;
    case 'turn':
      return `turn • rate ${(instruction.angularVelocity * (180 / Math.PI)).toFixed(0)}°/s • ${instruction.duration.toFixed(1)}s`;
    case 'wait':
      return `wait • ${instruction.duration.toFixed(1)}s`;
    case 'scan':
      return `scan${instruction.filter ? ` • ${instruction.filter}` : ''} • ${instruction.duration.toFixed(1)}s`;
    case 'gather':
      return `gather • ${instruction.duration.toFixed(1)}s`;
    case 'deposit':
      return `deposit • ${instruction.duration.toFixed(1)}s`;
    case 'status-toggle':
      return 'status toggle';
    case 'status-set':
      return `status set • ${instruction.value ? 'on' : 'off'}`;
    case 'loop':
      return `loop • ${instruction.instructions.length} step${instruction.instructions.length === 1 ? '' : 's'}`;
    default:
      return (instruction as { kind?: string }).kind ?? 'unknown';
  }
}

function formatTelemetryValue(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    if (Math.abs(value) >= 1000) {
      return value.toFixed(0);
    }
    if (Math.abs(value) >= 1) {
      return value.toFixed(1);
    }
    return value.toFixed(2);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((entry) => formatTelemetryValue(entry));
    const serialised = `[${items.join(', ')}]`;
    return serialised.length > 60 ? `${serialised.slice(0, 57)}…` : serialised;
  }
  if (value && typeof value === 'object') {
    try {
      const serialised = JSON.stringify(value);
      if (!serialised) {
        return 'object';
      }
      return serialised.length > 60 ? `${serialised.slice(0, 57)}…` : serialised;
    } catch (error) {
      return 'object';
    }
  }
  if (value === null) {
    return 'null';
  }
  return typeof value === 'undefined' ? 'undefined' : String(value);
}

function countProgramInstructions(instructions: BlockInstruction[] | undefined): number {
  if (!instructions || instructions.length === 0) {
    return 0;
  }

  let total = 0;
  for (const instruction of instructions) {
    total += 1;
    if (instruction.kind === 'loop') {
      total += countProgramInstructions(instruction.instructions);
    }
  }
  return total;
}
