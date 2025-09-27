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
import type {
  BlockInstruction,
  BooleanParameterBinding,
  NumberParameterBinding,
} from '../../runtime/blockProgram';
import type {
  ProgramDebugFrame,
  ProgramDebugState,
} from '../../runtime/blockProgramRunner';
import type { BlockProgramRunner } from '../../runtime/blockProgramRunner';
import type { MechanismChassis } from '../../mechanism';
import type { ComponentHandle, QueryResult, ECSWorld } from '../world';
import type { Entity } from '../entity';
import { System } from '../system';

interface DebugOverlaySystemDependencies
  extends Pick<
    SimulationWorldComponents,
    'MechanismCore' | 'ProgramRunner' | 'SpriteRef' | 'DebugOverlay'
  > {}

interface DebugOverlaySystemOptions {
  overlayLayer: Container;
  viewport: Viewport;
}

type TelemetrySnapshot = ReturnType<MechanismChassis['getTelemetrySnapshot']>;

class DebugOverlaySystem extends System<[
  ComponentHandle<MechanismChassis>,
  ComponentHandle<BlockProgramRunner>,
  ComponentHandle<Sprite>,
  ComponentHandle<DebugOverlayComponent>,
]> {
  constructor(
    private readonly MechanismCore: ComponentHandle<MechanismChassis>,
    private readonly ProgramRunner: ComponentHandle<BlockProgramRunner>,
    private readonly SpriteRef: ComponentHandle<Sprite>,
    private readonly DebugOverlay: ComponentHandle<DebugOverlayComponent>,
    private readonly overlayLayer: Container,
    private readonly viewport: Viewport,
  ) {
    super({ name: 'DebugOverlaySystem', processEmpty: true });
  }

  protected override query(world: ECSWorld) {
    return world
      .query.withAll(this.MechanismCore, this.ProgramRunner, this.SpriteRef, this.DebugOverlay);
  }

  override processAll(
    _world: ECSWorld,
    entities: QueryResult<[
      ComponentHandle<MechanismChassis>,
      ComponentHandle<BlockProgramRunner>,
      ComponentHandle<Sprite>,
      ComponentHandle<DebugOverlayComponent>,
    ]>[],
  ): void {
    const processed = new Set<Entity>();

    for (const [entity, overlay] of this.DebugOverlay.entries()) {
      overlay.container.visible = false;
      if (!overlay.container.destroyed && overlay.container.parent !== this.overlayLayer) {
        this.overlayLayer.addChild(overlay.container);
      }
      processed.add(entity);
    }

    for (const [entity, mechanismCore, programRunner, sprite, overlay] of entities) {
      processed.delete(entity);
      updateDebugOverlay({
        overlay,
        mechanismCore,
        programRunner,
        sprite,
        viewport: this.viewport,
      });
    }

    for (const entity of processed) {
      const overlay = this.DebugOverlay.get(entity);
      if (!overlay) {
        continue;
      }
      overlay.lastRenderedText = '';
    }
  }
}

export function createDebugOverlaySystem(
  { MechanismCore, ProgramRunner, SpriteRef, DebugOverlay }: DebugOverlaySystemDependencies,
  { overlayLayer, viewport }: DebugOverlaySystemOptions,
): DebugOverlaySystem {
  return new DebugOverlaySystem(
    MechanismCore,
    ProgramRunner,
    SpriteRef,
    DebugOverlay,
    overlayLayer,
    viewport,
  );
}

interface UpdateDebugOverlayOptions {
  overlay: DebugOverlayComponent;
  mechanismCore: MechanismChassis;
  programRunner: BlockProgramRunner;
  sprite: Sprite;
  viewport: Viewport;
}

function updateDebugOverlay({ overlay, mechanismCore, programRunner, sprite, viewport }: UpdateDebugOverlayOptions): void {
  const programDebug = programRunner.getDebugState();
  const telemetry = mechanismCore.getTelemetrySnapshot();

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

function getLiteralNumber(binding: NumberParameterBinding | undefined): number | null {
  if (!binding) {
    return null;
  }
  if (typeof binding.literal?.value === 'number') {
    return binding.literal.value;
  }
  if (binding.expression?.kind === 'literal' && typeof binding.expression.value === 'number') {
    return binding.expression.value;
  }
  return null;
}

function formatNumberBinding(binding: NumberParameterBinding, digits = 1): string {
  const literal = getLiteralNumber(binding);
  const hasExpression = binding.expression && binding.expression.kind !== 'literal';
  if (literal !== null) {
    const formatted = literal.toFixed(digits);
    return hasExpression ? `${formatted}*` : formatted;
  }
  return hasExpression ? 'expr*' : 'expr';
}

function formatBooleanBinding(binding: BooleanParameterBinding): string {
  const literal = typeof binding.literal?.value === 'boolean'
    ? binding.literal.value
    : binding.expression?.kind === 'literal'
      ? binding.expression.value
      : null;
  const hasExpression = binding.expression && binding.expression.kind !== 'literal';
  if (typeof literal === 'boolean') {
    const base = literal ? 'true' : 'false';
    return hasExpression ? `${base}*` : base;
  }
  return hasExpression ? 'expr*' : 'expr';
}

function formatInstruction(instruction: BlockInstruction): string {
  switch (instruction.kind) {
    case 'move':
      return `move • speed ${formatNumberBinding(instruction.speed, 0)} • ${formatNumberBinding(instruction.duration, 1)}s`;
    case 'turn':
      {
        const literalRate = getLiteralNumber(instruction.angularVelocity);
        const hasExpression = instruction.angularVelocity.expression && instruction.angularVelocity.expression.kind !== 'literal';
        const rateText = literalRate !== null
          ? `${(literalRate * (180 / Math.PI)).toFixed(0)}°/s${hasExpression ? '*' : ''}`
          : hasExpression
            ? 'expr*'
            : 'expr';
        return `turn • rate ${rateText} • ${formatNumberBinding(instruction.duration, 1)}s`;
      }
    case 'wait':
      return `wait • ${formatNumberBinding(instruction.duration, 1)}s`;
    case 'scan':
      return `scan${instruction.filter ? ` • ${instruction.filter}` : ''} • ${formatNumberBinding(instruction.duration, 1)}s`;
    case 'gather':
      return `gather • ${formatNumberBinding(instruction.duration, 1)}s`;
    case 'deposit':
      return `deposit • ${formatNumberBinding(instruction.duration, 1)}s`;
    case 'status-toggle':
      return 'status toggle';
    case 'status-set':
      return `status set • ${formatBooleanBinding(instruction.value)}`;
    case 'loop':
      if (instruction.mode === 'counted') {
        const literalCount = getLiteralNumber(instruction.iterations);
        const hasExpression = instruction.iterations.expression && instruction.iterations.expression.kind !== 'literal';
        const countText = literalCount !== null ? literalCount.toString() : 'expr';
        const suffix = hasExpression ? '*' : '';
        return `repeat ×${countText}${suffix} • ${instruction.instructions.length} step${instruction.instructions.length === 1 ? '' : 's'}`;
      }
      return `loop ∞ • ${instruction.instructions.length} step${instruction.instructions.length === 1 ? '' : 's'}`;
    case 'branch': {
      const thenLength = instruction.whenTrue.length;
      const elseLength = instruction.whenFalse.length;
      return `if • then ${thenLength} / else ${elseLength}`;
    }
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
    if (instruction.kind === 'branch') {
      total += countProgramInstructions(instruction.whenTrue);
      total += countProgramInstructions(instruction.whenFalse);
    }
  }
  return total;
}
