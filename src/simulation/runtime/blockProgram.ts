import { BLOCK_MAP } from '../../blocks/library';
import type {
  BlockInstance,
  BlockParameterDefinition,
  BlockParameterSignalOption,
  WorkspaceState,
} from '../../types/blocks';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
}

export type ParameterSource = 'default' | 'user';
export type ExpressionValueType = 'number' | 'boolean';

export interface NumberParameterMetadata {
  min?: number;
  max?: number;
  step?: number;
}

export interface LiteralExpression<TValue extends ExpressionValueType> {
  kind: 'literal';
  valueType: TValue;
  value: TValue extends 'number' ? number : boolean;
  source: ParameterSource;
  metadata?: TValue extends 'number' ? NumberParameterMetadata : undefined;
  label?: string;
}

export interface SignalDescriptor {
  id: string;
  label: string;
  description?: string;
  moduleId: string | null;
  signalId: string | null;
}

export interface SignalExpression<TValue extends ExpressionValueType> {
  kind: 'signal';
  valueType: TValue;
  signal: SignalDescriptor;
  fallback?: LiteralExpression<TValue> | null;
}

export interface OperatorExpression<TValue extends ExpressionValueType> {
  kind: 'operator';
  valueType: TValue;
  operator: 'add' | 'greater-than' | 'and';
  inputs: ExpressionNode[];
  label?: string;
}

export type ExpressionNode =
  | LiteralExpression<'number'>
  | LiteralExpression<'boolean'>
  | SignalExpression<'number'>
  | SignalExpression<'boolean'>
  | OperatorExpression<'number'>
  | OperatorExpression<'boolean'>;

export type NumberExpression = Extract<ExpressionNode, { valueType: 'number' }>;
export type BooleanExpression = Extract<ExpressionNode, { valueType: 'boolean' }>;

export interface NumberParameterBinding {
  literal: LiteralExpression<'number'> | null;
  expression: NumberExpression | null;
}

export interface BooleanParameterBinding {
  literal: LiteralExpression<'boolean'> | null;
  expression: BooleanExpression | null;
}

export interface SignalParameterBinding {
  selected: SignalDescriptor | null;
  source: ParameterSource;
  allowNone: boolean;
  options: SignalDescriptor[];
}

export interface MoveToTargetMetadata {
  useScanHit: BooleanParameterBinding;
  scanHitIndex: NumberParameterBinding;
  literalPosition: {
    x: NumberParameterBinding;
    y: NumberParameterBinding;
  };
}

export interface StringLiteralValue {
  value: string;
  source: ParameterSource;
  label?: string;
}

export interface UseItemSlotMetadata {
  index: NumberParameterBinding;
  label: StringLiteralValue;
}

export interface UseItemTargetMetadata {
  useScanHit: BooleanParameterBinding;
  scanHitIndex: NumberParameterBinding;
  literalPosition: {
    x: NumberParameterBinding;
    y: NumberParameterBinding;
  };
}

export interface BlockInstructionMetadata {
  sourceBlockId: string;
}

export type MoveToInstruction = BlockInstructionMetadata & {
  kind: 'move-to';
  duration: NumberParameterBinding;
  speed: NumberParameterBinding;
  target: MoveToTargetMetadata;
};

export type UseItemInstruction = BlockInstructionMetadata & {
  kind: 'use-item';
  duration: NumberParameterBinding;
  slot: UseItemSlotMetadata;
  target: UseItemTargetMetadata;
};

export type BlockInstruction =
  | MoveToInstruction
  | UseItemInstruction
  | (BlockInstructionMetadata & {
      kind: 'move';
      duration: NumberParameterBinding;
      speed: NumberParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'turn';
      duration: NumberParameterBinding;
      angularVelocity: NumberParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'wait';
      duration: NumberParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'scan';
      duration: NumberParameterBinding;
      filter: string | null;
    })
  | (BlockInstructionMetadata & {
      kind: 'gather';
      duration: NumberParameterBinding;
      target: 'auto';
    })
  | (BlockInstructionMetadata & {
      kind: 'store-storage';
      duration: NumberParameterBinding;
      boxId: StringLiteralValue;
      resource: StringLiteralValue;
      amount: NumberParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'withdraw-storage';
      duration: NumberParameterBinding;
      boxId: StringLiteralValue;
      resource: StringLiteralValue;
      amount: NumberParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'deposit';
      duration: NumberParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'status-toggle';
      duration: NumberParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'status-set';
      duration: NumberParameterBinding;
      value: BooleanParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'loop';
      mode: 'forever';
      instructions: BlockInstruction[];
    })
  | (BlockInstructionMetadata & {
      kind: 'loop';
      mode: 'counted';
      instructions: BlockInstruction[];
      iterations: NumberParameterBinding;
    })
  | (BlockInstructionMetadata & {
      kind: 'branch';
      condition: BooleanParameterBinding;
      whenTrue: BlockInstruction[];
      whenFalse: BlockInstruction[];
    });

export interface CompiledProgram {
  instructions: BlockInstruction[];
}

export interface CompilationResult {
  program: CompiledProgram;
  diagnostics: Diagnostic[];
}

const MOVE_SPEED = 80;
const TURN_RATE = Math.PI / 2;
const WAIT_DURATION = 1;
const SCAN_DURATION = 1;
const GATHER_DURATION = 1.5;
const USE_ITEM_DURATION = 3;

interface CompilationContext {
  unsupportedBlocks: Set<string>;
}

const createContext = (): CompilationContext => ({
  unsupportedBlocks: new Set<string>(),
});

export function createNumberLiteralExpression(
  value: number,
  { source = 'default', metadata, label }: { source?: ParameterSource; metadata?: NumberParameterMetadata; label?: string } = {},
): LiteralExpression<'number'> {
  return {
    kind: 'literal',
    valueType: 'number',
    value,
    source,
    metadata,
    label,
  } satisfies LiteralExpression<'number'>;
}

export function createBooleanLiteralExpression(
  value: boolean,
  { source = 'default', label }: { source?: ParameterSource; label?: string } = {},
): LiteralExpression<'boolean'> {
  return {
    kind: 'literal',
    valueType: 'boolean',
    value,
    source,
    label,
  } satisfies LiteralExpression<'boolean'>;
}

export function createNumberLiteralBinding(
  value: number,
  options: { source?: ParameterSource; metadata?: NumberParameterMetadata; label?: string } = {},
): NumberParameterBinding {
  const literal = createNumberLiteralExpression(value, options);
  return { literal, expression: literal } satisfies NumberParameterBinding;
}

export function createBooleanLiteralBinding(
  value: boolean,
  options: { source?: ParameterSource; label?: string } = {},
): BooleanParameterBinding {
  const literal = createBooleanLiteralExpression(value, options);
  return { literal, expression: literal } satisfies BooleanParameterBinding;
}

const describeValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value ? `"${value}"` : '""';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return 'list';
  }
  return typeof value;
};

const formatParameterLabel = (blockLabel: string, parameterName: string): string => `${blockLabel} → ${parameterName}`;

const getBlockLabel = (blockType: string): string => BLOCK_MAP[blockType]?.label ?? blockType;

const getParameterDefinition = (
  blockType: string,
  parameterName: string,
): BlockParameterDefinition | undefined => BLOCK_MAP[blockType]?.parameters?.[parameterName];

const parseSignalIdentifier = (id: string | null): { moduleId: string | null; signalId: string | null } => {
  if (!id) {
    return { moduleId: null, signalId: null };
  }
  const lastDot = id.lastIndexOf('.');
  if (lastDot <= 0 || lastDot >= id.length - 1) {
    return { moduleId: null, signalId: id };
  }
  const moduleId = id.slice(0, lastDot);
  const signalId = id.slice(lastDot + 1);
  return { moduleId, signalId };
};

const mapSignalOption = (option: BlockParameterSignalOption): SignalDescriptor => {
  const { moduleId, signalId } = parseSignalIdentifier(option.id);
  return {
    id: option.id,
    label: option.label,
    description: option.description,
    moduleId,
    signalId,
  } satisfies SignalDescriptor;
};

interface NumberBindingOptions {
  label: string;
  fallback?: number;
  minimum?: number;
  maximum?: number;
  enforceInteger?: boolean;
}

interface BooleanBindingOptions {
  label: string;
  fallback?: boolean;
}

interface StringBindingOptions {
  label: string;
  fallback?: string;
  trim?: boolean;
  allowEmpty?: boolean;
  required?: boolean;
}

const clampNumber = (value: number, min?: number, max?: number): number => {
  let result = value;
  if (typeof min === 'number' && Number.isFinite(min)) {
    result = Math.max(result, min);
  }
  if (typeof max === 'number' && Number.isFinite(max)) {
    result = Math.min(result, max);
  }
  return result;
};

const resolveNumberBinding = (
  block: BlockInstance,
  parameterName: string,
  diagnostics: Diagnostic[],
  options: NumberBindingOptions,
): NumberParameterBinding => {
  const blockLabel = getBlockLabel(block.type);
  const label = formatParameterLabel(blockLabel, parameterName);
  const definition = getParameterDefinition(block.type, parameterName);

  const metadata: NumberParameterMetadata = {};
  if (definition?.kind === 'number') {
    if (typeof definition.min === 'number') {
      metadata.min = definition.min;
    }
    if (typeof definition.max === 'number') {
      metadata.max = definition.max;
    }
    if (typeof definition.step === 'number') {
      metadata.step = definition.step;
    }
  }

  const fallback =
    typeof options.fallback === 'number'
      ? options.fallback
      : definition?.kind === 'number'
        ? definition.defaultValue
        : 0;

  let value = fallback;
  let source: ParameterSource = 'default';

  const parameter = block.parameters?.[parameterName];
  if (parameter) {
    if (parameter.kind === 'number' && Number.isFinite(parameter.value)) {
      value = parameter.value;
      const differsFromDefault = Math.abs(value - fallback) > 1e-6;
      source = differsFromDefault ? 'user' : 'default';
    } else {
      diagnostics.push({
        severity: 'warning',
        message: `${label} received ${describeValue((parameter as { value?: unknown })?.value)}; defaulting to ${fallback}.`,
      });
    }
  }

  if (typeof options.minimum === 'number' && value < options.minimum) {
    diagnostics.push({
      severity: 'warning',
      message: `${label} must be at least ${options.minimum}; clamping ${value} to ${options.minimum}.`,
    });
    value = options.minimum;
    source = 'user';
  }

  if (typeof options.maximum === 'number' && value > options.maximum) {
    diagnostics.push({
      severity: 'warning',
      message: `${label} must be at most ${options.maximum}; clamping ${value} to ${options.maximum}.`,
    });
    value = options.maximum;
    source = 'user';
  }

  value = clampNumber(value, metadata.min, metadata.max);

  if (options.enforceInteger) {
    const integerValue = value >= 0 ? Math.floor(value) : Math.ceil(value);
    if (integerValue !== value) {
      diagnostics.push({
        severity: 'warning',
        message: `${label} must be a whole number; rounding ${value} to ${integerValue}.`,
      });
      value = integerValue;
      source = 'user';
    }
  }

  const literal = createNumberLiteralExpression(value, { source, metadata, label });

  const expression = compileNumberExpressionInput(block, parameterName, diagnostics, {
    label,
    fallback: literal,
  });

  return { literal, expression } satisfies NumberParameterBinding;
};

const resolveBooleanBinding = (
  block: BlockInstance,
  parameterName: string,
  diagnostics: Diagnostic[],
  options: BooleanBindingOptions,
): BooleanParameterBinding => {
  const blockLabel = getBlockLabel(block.type);
  const label = formatParameterLabel(blockLabel, parameterName);
  const definition = getParameterDefinition(block.type, parameterName);

  const fallback =
    typeof options.fallback === 'boolean'
      ? options.fallback
      : definition?.kind === 'boolean'
        ? definition.defaultValue
        : false;

  let value = fallback;
  let source: ParameterSource = 'default';

  const parameter = block.parameters?.[parameterName];
  if (parameter) {
    if (parameter.kind === 'boolean') {
      value = parameter.value;
      source = parameter.value === fallback ? 'default' : 'user';
    } else {
      diagnostics.push({
        severity: 'warning',
        message: `${label} received ${describeValue((parameter as { value?: unknown })?.value)}; defaulting to ${fallback}.`,
      });
    }
  }

  const literal = createBooleanLiteralExpression(value, { source, label });

  const expression = compileBooleanExpressionInput(block, parameterName, diagnostics, {
    label,
    fallback: literal,
  });

  return { literal, expression } satisfies BooleanParameterBinding;
};

const resolveStringParameter = (
  block: BlockInstance,
  parameterName: string,
  diagnostics: Diagnostic[],
  options: StringBindingOptions,
): StringLiteralValue => {
  const blockLabel = getBlockLabel(block.type);
  const label = formatParameterLabel(blockLabel, parameterName);
  const definition = getParameterDefinition(block.type, parameterName);

  const fallback =
    typeof options.fallback === 'string'
      ? options.fallback
      : definition?.kind === 'string'
        ? definition.defaultValue
        : '';

  const parameter = block.parameters?.[parameterName];
  if (!parameter) {
    if (options.required) {
      diagnostics.push({
        severity: 'error',
        message: `${getBlockLabel(block.type)} block is missing its ${parameterName} parameter and will be ignored.`,
      });
    }
    return { value: fallback, source: 'default', label } satisfies StringLiteralValue;
  }

  if (parameter.kind !== 'string') {
    diagnostics.push({
      severity: 'warning',
      message: `${label} received ${describeValue((parameter as { value?: unknown })?.value)}; defaulting to "${fallback}".`,
    });
    return { value: fallback, source: 'default', label } satisfies StringLiteralValue;
  }

  const rawValue = typeof parameter.value === 'string' ? parameter.value : '';
  const trimmed = options.trim === false ? rawValue : rawValue.trim();
  const allowEmpty = options.allowEmpty === true;
  const value = trimmed.length > 0 || allowEmpty ? trimmed : fallback;
  const source: ParameterSource = value === fallback ? 'default' : 'user';

  return { value, source, label } satisfies StringLiteralValue;
};

interface NumberExpressionOptions {
  label: string;
  fallback?: LiteralExpression<'number'> | null;
}

interface BooleanExpressionOptions {
  label: string;
  fallback?: LiteralExpression<'boolean'> | null;
}

const compileNumberExpressionInput = (
  block: BlockInstance,
  inputName: string,
  diagnostics: Diagnostic[],
  options: NumberExpressionOptions,
): NumberExpression | null => {
  const expressionBlocks = block.expressionInputs?.[inputName];
  if (!expressionBlocks || expressionBlocks.length === 0) {
    if (options.fallback) {
      diagnostics.push({
        severity: 'warning',
        message: `${options.label} is missing a value; defaulting to ${options.fallback.value}.`,
      });
    }
    return null;
  }
  const [root] = expressionBlocks;
  return compileNumberExpression(root, diagnostics, options);
};

const compileBooleanExpressionInput = (
  block: BlockInstance,
  inputName: string,
  diagnostics: Diagnostic[],
  options: BooleanExpressionOptions,
): BooleanExpression | null => {
  const expressionBlocks = block.expressionInputs?.[inputName];
  if (!expressionBlocks || expressionBlocks.length === 0) {
    if (options.fallback) {
      diagnostics.push({
        severity: 'warning',
        message: `${options.label} is missing a value; defaulting to ${options.fallback.value ? 'true' : 'false'}.`,
      });
    }
    return null;
  }
  const [root] = expressionBlocks;
  return compileBooleanExpression(root, diagnostics, options);
};

const compileNumberExpression = (
  block: BlockInstance,
  diagnostics: Diagnostic[],
  options: NumberExpressionOptions,
): NumberExpression | null => {
  const label = getBlockLabel(block.type);
  switch (block.type) {
    case 'literal-number': {
      const literalDefinition = getParameterDefinition(block.type, 'value');
      const metadata: NumberParameterMetadata = {};
      if (literalDefinition?.kind === 'number') {
        if (typeof literalDefinition.min === 'number') {
          metadata.min = literalDefinition.min;
        }
        if (typeof literalDefinition.max === 'number') {
          metadata.max = literalDefinition.max;
        }
        if (typeof literalDefinition.step === 'number') {
          metadata.step = literalDefinition.step;
        }
      }
      const parameter = block.parameters?.value;
      const fallback = literalDefinition?.kind === 'number' ? literalDefinition.defaultValue : 0;
      let value = fallback;
      let source: ParameterSource = 'default';
      if (parameter) {
        if (parameter.kind === 'number' && Number.isFinite(parameter.value)) {
          value = parameter.value;
          source = Math.abs(parameter.value - fallback) > 1e-6 ? 'user' : 'default';
        } else {
          diagnostics.push({
            severity: 'warning',
            message: `${label} literal received ${describeValue((parameter as { value?: unknown })?.value)}; defaulting to ${fallback}.`,
          });
        }
      }
      return createNumberLiteralExpression(value, { source, metadata, label });
    }
    case 'read-signal': {
      const selection = resolveSignalSelection(block, 'signal', diagnostics, label);
      if (!selection.selected) {
        if (options.fallback) {
          diagnostics.push({
            severity: 'warning',
            message: `${options.label} has no signal selected; defaulting to ${options.fallback.value}.`,
          });
        }
        return options.fallback ?? createNumberLiteralExpression(0, { label: options.label });
      }
      return {
        kind: 'signal',
        valueType: 'number',
        signal: selection.selected,
        fallback: options.fallback ?? null,
      } satisfies SignalExpression<'number'>;
    }
    case 'operator-add': {
      const first = block.expressionInputs?.firstValue?.[0];
      const second = block.expressionInputs?.secondValue?.[0];
      const firstExpression = first
        ? compileNumberExpression(first, diagnostics, {
            label: `${label} → first value`,
            fallback: options.fallback,
          })
        : null;
      const secondExpression = second
        ? compileNumberExpression(second, diagnostics, {
            label: `${label} → second value`,
            fallback: options.fallback,
          })
        : null;

      const inputs: NumberExpression[] = [];
      if (firstExpression) {
        inputs.push(firstExpression);
      }
      if (secondExpression) {
        inputs.push(secondExpression);
      }
      if (inputs.length !== 2) {
        diagnostics.push({
          severity: 'warning',
          message: `${label} is missing inputs; defaulting to ${options.fallback?.value ?? 0}.`,
        });
      }
      const safeInputs = inputs.length === 2 ? inputs : [
        firstExpression ?? options.fallback ?? createNumberLiteralExpression(0, { label: options.label }),
        secondExpression ?? options.fallback ?? createNumberLiteralExpression(0, { label: options.label }),
      ];
      return {
        kind: 'operator',
        valueType: 'number',
        operator: 'add',
        inputs: safeInputs,
        label,
      } satisfies OperatorExpression<'number'>;
    }
    default: {
      diagnostics.push({
        severity: 'warning',
        message: `${options.label} cannot use the ${label} block; defaulting to ${options.fallback?.value ?? 0}.`,
      });
      return options.fallback ?? createNumberLiteralExpression(0, { label: options.label });
    }
  }
};

const compileBooleanExpression = (
  block: BlockInstance,
  diagnostics: Diagnostic[],
  options: BooleanExpressionOptions,
): BooleanExpression | null => {
  const label = getBlockLabel(block.type);
  switch (block.type) {
    case 'literal-boolean': {
      const definition = getParameterDefinition(block.type, 'value');
      const fallback = definition?.kind === 'boolean' ? definition.defaultValue : false;
      const parameter = block.parameters?.value;
      let value = fallback;
      let source: ParameterSource = 'default';
      if (parameter) {
        if (parameter.kind === 'boolean') {
          value = parameter.value;
          source = parameter.value === fallback ? 'default' : 'user';
        } else {
          diagnostics.push({
            severity: 'warning',
            message: `${label} literal received ${describeValue((parameter as { value?: unknown })?.value)}; defaulting to ${fallback}.`,
          });
        }
      }
      return createBooleanLiteralExpression(value, { source, label });
    }
    case 'read-signal': {
      const selection = resolveSignalSelection(block, 'signal', diagnostics, label);
      if (!selection.selected) {
        if (options.fallback) {
          diagnostics.push({
            severity: 'warning',
            message: `${options.label} has no signal selected; defaulting to ${options.fallback.value ? 'true' : 'false'}.`,
          });
        }
        return options.fallback ?? createBooleanLiteralExpression(false, { label: options.label });
      }
      return {
        kind: 'signal',
        valueType: 'boolean',
        signal: selection.selected,
        fallback: options.fallback ?? null,
      } satisfies SignalExpression<'boolean'>;
    }
    case 'operator-and': {
      const first = block.expressionInputs?.firstValue?.[0];
      const second = block.expressionInputs?.secondValue?.[0];
      const firstExpression = first
        ? compileBooleanExpression(first, diagnostics, {
            label: `${label} → first value`,
            fallback: options.fallback,
          })
        : null;
      const secondExpression = second
        ? compileBooleanExpression(second, diagnostics, {
            label: `${label} → second value`,
            fallback: options.fallback,
          })
        : null;

      const inputs: BooleanExpression[] = [];
      if (firstExpression) {
        inputs.push(firstExpression);
      }
      if (secondExpression) {
        inputs.push(secondExpression);
      }
      if (inputs.length !== 2) {
        diagnostics.push({
          severity: 'warning',
          message: `${label} is missing inputs; defaulting to ${options.fallback?.value ? 'true' : 'false'}.`,
        });
      }
      const safeInputs = inputs.length === 2 ? inputs : [
        firstExpression ?? options.fallback ?? createBooleanLiteralExpression(false, { label: options.label }),
        secondExpression ?? options.fallback ?? createBooleanLiteralExpression(false, { label: options.label }),
      ];
      return {
        kind: 'operator',
        valueType: 'boolean',
        operator: 'and',
        inputs: safeInputs,
        label,
      } satisfies OperatorExpression<'boolean'>;
    }
    case 'operator-greater-than': {
      const first = block.expressionInputs?.firstValue?.[0];
      const second = block.expressionInputs?.secondValue?.[0];
      const firstExpression = first
        ? compileNumberExpression(first, diagnostics, {
            label: `${label} → first value`,
            fallback: options.fallback ? createNumberLiteralExpression(options.fallback.value ? 1 : 0, { label: options.label }) : undefined,
          })
        : null;
      const secondExpression = second
        ? compileNumberExpression(second, diagnostics, {
            label: `${label} → second value`,
            fallback: options.fallback ? createNumberLiteralExpression(options.fallback.value ? 1 : 0, { label: options.label }) : undefined,
          })
        : null;

      const inputs: NumberExpression[] = [];
      if (firstExpression) {
        inputs.push(firstExpression);
      }
      if (secondExpression) {
        inputs.push(secondExpression);
      }
      if (inputs.length !== 2) {
        diagnostics.push({
          severity: 'warning',
          message: `${label} is missing inputs; defaulting to ${options.fallback?.value ? 'true' : 'false'}.`,
        });
      }
      const safeInputs = inputs.length === 2 ? inputs : [
        firstExpression ?? createNumberLiteralExpression(0, { label: options.label }),
        secondExpression ?? createNumberLiteralExpression(0, { label: options.label }),
      ];
      return {
        kind: 'operator',
        valueType: 'boolean',
        operator: 'greater-than',
        inputs: safeInputs,
        label,
      } satisfies OperatorExpression<'boolean'>;
    }
    default: {
      diagnostics.push({
        severity: 'warning',
        message: `${options.label} cannot use the ${label} block; defaulting to ${options.fallback?.value ? 'true' : 'false'}.`,
      });
      return options.fallback ?? createBooleanLiteralExpression(false, { label: options.label });
    }
  }
};

const resolveSignalSelection = (
  block: BlockInstance,
  parameterName: string,
  diagnostics: Diagnostic[],
  contextLabel: string,
): SignalParameterBinding => {
  const definition = getParameterDefinition(block.type, parameterName);
  if (!definition || definition.kind !== 'signal') {
    return {
      selected: null,
      source: 'default',
      allowNone: true,
      options: [],
    } satisfies SignalParameterBinding;
  }

  const options = definition.options.map(mapSignalOption);
  const allowNone = definition.allowNone !== false;

  const parameter = block.parameters?.[parameterName];
  const rawValue = parameter && parameter.kind === 'signal' ? parameter.value : null;

  const defaultOptionId = definition.defaultValue ?? null;
  const defaultOption = options.find((option) => option.id === defaultOptionId) ?? null;

  let selected: SignalDescriptor | null = null;
  let source: ParameterSource = 'default';

  if (rawValue) {
    const candidate = options.find((option) => option.id === rawValue) ?? null;
    if (candidate) {
      selected = candidate;
      source = candidate.id === defaultOption?.id ? 'default' : 'user';
    } else {
      diagnostics.push({
        severity: 'warning',
        message: `${contextLabel} references unknown signal ${describeValue(rawValue)}; defaulting to ${defaultOption?.label ?? 'none'}.`,
      });
    }
  } else if (!allowNone && defaultOption) {
    selected = defaultOption;
  }

  if (!selected && !allowNone && defaultOption) {
    diagnostics.push({
      severity: 'warning',
      message: `${contextLabel} must select a signal; defaulting to ${defaultOption.label}.`,
    });
    selected = defaultOption;
  }

  return {
    selected,
    source,
    allowNone,
    options,
  } satisfies SignalParameterBinding;
};

const compileSequence = (
  blocks: BlockInstance[] | undefined,
  diagnostics: Diagnostic[],
  context: CompilationContext,
): BlockInstruction[] => {
  if (!blocks || blocks.length === 0) {
    return [];
  }

  const instructions: BlockInstruction[] = [];
  for (const block of blocks) {
    instructions.push(...compileBlock(block, diagnostics, context));
  }
  return instructions;
};

const compileBlock = (
  block: BlockInstance,
  diagnostics: Diagnostic[],
  context: CompilationContext,
): BlockInstruction[] => {
  const sourceBlockId = block.instanceId;
  switch (block.type) {
    case 'move':
      return [
        {
          kind: 'move',
          duration: createNumberLiteralBinding(1, { label: 'Move → duration' }),
          speed: createNumberLiteralBinding(MOVE_SPEED, { label: 'Move → speed' }),
          sourceBlockId,
        },
      ];
    case 'move-to': {
      const speedBinding = resolveNumberBinding(block, 'speed', diagnostics, {
        label: formatParameterLabel(getBlockLabel('move-to'), 'speed'),
        fallback: MOVE_SPEED,
        minimum: 0,
      });
      const useScanBinding = resolveBooleanBinding(block, 'useScanHit', diagnostics, {
        label: formatParameterLabel(getBlockLabel('move-to'), 'useScanHit'),
        fallback: true,
      });
      const scanHitBinding = resolveNumberBinding(block, 'scanHitIndex', diagnostics, {
        label: formatParameterLabel(getBlockLabel('move-to'), 'scanHitIndex'),
        fallback: 1,
        minimum: 1,
        enforceInteger: true,
      });
      const targetXBinding = resolveNumberBinding(block, 'targetX', diagnostics, {
        label: formatParameterLabel(getBlockLabel('move-to'), 'targetX'),
        fallback: 0,
      });
      const targetYBinding = resolveNumberBinding(block, 'targetY', diagnostics, {
        label: formatParameterLabel(getBlockLabel('move-to'), 'targetY'),
        fallback: 0,
      });
      return [
        {
          kind: 'move-to',
          duration: createNumberLiteralBinding(1, { label: 'Move To → duration' }),
          speed: speedBinding,
          target: {
            useScanHit: useScanBinding,
            scanHitIndex: scanHitBinding,
            literalPosition: {
              x: targetXBinding,
              y: targetYBinding,
            },
          },
          sourceBlockId,
        },
      ];
    }
    case 'turn':
      return [
        {
          kind: 'turn',
          duration: createNumberLiteralBinding(1, { label: 'Turn → duration' }),
          angularVelocity: createNumberLiteralBinding(TURN_RATE, { label: 'Turn → rate' }),
          sourceBlockId,
        },
      ];
    case 'wait':
      return [
        {
          kind: 'wait',
          duration: createNumberLiteralBinding(WAIT_DURATION, { label: 'Wait → duration' }),
          sourceBlockId,
        },
      ];
    case 'scan-resources':
      return [
        {
          kind: 'scan',
          duration: createNumberLiteralBinding(SCAN_DURATION, { label: 'Scan → duration' }),
          filter: null,
          sourceBlockId,
        },
      ];
    case 'gather-resource':
      return [
        {
          kind: 'gather',
          duration: createNumberLiteralBinding(GATHER_DURATION, { label: 'Gather → duration' }),
          target: 'auto',
          sourceBlockId,
        },
      ];
    case 'use-item-slot': {
      const hasSlotIndex =
        !!block.parameters && Object.prototype.hasOwnProperty.call(block.parameters, 'slotIndex');
      if (!hasSlotIndex) {
        diagnostics.push({
          severity: 'error',
          message: `${getBlockLabel(block.type)} block is missing its slot index parameter and will be ignored.`,
        });
        return [];
      }

      const slotIndexBinding = resolveNumberBinding(block, 'slotIndex', diagnostics, {
        label: formatParameterLabel(getBlockLabel('use-item-slot'), 'slotIndex'),
        fallback: 1,
        minimum: 1,
        enforceInteger: true,
      });
      const slotLabel = resolveStringParameter(block, 'slotLabel', diagnostics, {
        label: formatParameterLabel(getBlockLabel('use-item-slot'), 'slotLabel'),
        fallback: 'Primary Tool',
      });
      const useScanBinding = resolveBooleanBinding(block, 'useScanHit', diagnostics, {
        label: formatParameterLabel(getBlockLabel('use-item-slot'), 'useScanHit'),
        fallback: true,
      });
      const scanHitIndexBinding = resolveNumberBinding(block, 'scanHitIndex', diagnostics, {
        label: formatParameterLabel(getBlockLabel('use-item-slot'), 'scanHitIndex'),
        fallback: 1,
        minimum: 1,
        enforceInteger: true,
      });
      const targetXBinding = resolveNumberBinding(block, 'targetX', diagnostics, {
        label: formatParameterLabel(getBlockLabel('use-item-slot'), 'targetX'),
        fallback: 0,
      });
      const targetYBinding = resolveNumberBinding(block, 'targetY', diagnostics, {
        label: formatParameterLabel(getBlockLabel('use-item-slot'), 'targetY'),
        fallback: 0,
      });

      return [
        {
          kind: 'use-item',
          duration: createNumberLiteralBinding(USE_ITEM_DURATION, { label: 'Use Tool Slot → duration' }),
          slot: {
            index: slotIndexBinding,
            label: slotLabel,
          },
          target: {
            useScanHit: useScanBinding,
            scanHitIndex: scanHitIndexBinding,
            literalPosition: {
              x: targetXBinding,
              y: targetYBinding,
            },
          },
          sourceBlockId,
        },
      ];
    }
    case 'deposit-cargo':
      return [
        {
          kind: 'deposit',
          duration: createNumberLiteralBinding(WAIT_DURATION, { label: 'Deposit → duration' }),
          sourceBlockId,
        },
      ];
    case 'store-storage': {
      const boxId = resolveStringParameter(block, 'boxId', diagnostics, {
        fallback: 'storage.box.base',
        allowEmpty: true,
      });
      const resource = resolveStringParameter(block, 'resource', diagnostics, {
        fallback: '',
        allowEmpty: true,
      });
      const amount = resolveNumberBinding(block, 'amount', diagnostics, {
        label: formatParameterLabel(getBlockLabel('store-storage'), 'amount'),
        fallback: 0,
        minimum: 0,
      });
      return [
        {
          kind: 'store-storage',
          duration: createNumberLiteralBinding(WAIT_DURATION, { label: 'Store Storage → duration' }),
          boxId,
          resource,
          amount,
          sourceBlockId,
        },
      ];
    }
    case 'withdraw-storage': {
      const boxId = resolveStringParameter(block, 'boxId', diagnostics, {
        fallback: 'storage.box.base',
        allowEmpty: true,
      });
      const resource = resolveStringParameter(block, 'resource', diagnostics, {
        fallback: '',
        allowEmpty: true,
      });
      const amount = resolveNumberBinding(block, 'amount', diagnostics, {
        label: formatParameterLabel(getBlockLabel('withdraw-storage'), 'amount'),
        fallback: 0,
        minimum: 0,
      });
      return [
        {
          kind: 'withdraw-storage',
          duration: createNumberLiteralBinding(WAIT_DURATION, { label: 'Withdraw Storage → duration' }),
          boxId,
          resource,
          amount,
          sourceBlockId,
        },
      ];
    }
    case 'toggle-status':
      return [
        {
          kind: 'status-toggle',
          duration: createNumberLiteralBinding(0, { label: 'Toggle Status → duration' }),
          sourceBlockId,
        },
      ];
    case 'set-status': {
      const valueBinding = resolveBooleanBinding(block, 'value', diagnostics, {
        label: formatParameterLabel(getBlockLabel('set-status'), 'value'),
        fallback: true,
      });
      return [
        {
          kind: 'status-set',
          duration: createNumberLiteralBinding(0, { label: 'Set Status → duration' }),
          value: valueBinding,
          sourceBlockId,
        },
      ];
    }
    case 'repeat': {
      const inner = compileSequence(block.slots?.do, diagnostics, context);
      if (inner.length === 0) {
        diagnostics.push({
          severity: 'warning',
          message: 'Repeat block has no actions and will be ignored.',
        });
        return [];
      }
      const countBinding = resolveNumberBinding(block, 'count', diagnostics, {
        label: formatParameterLabel(getBlockLabel('repeat'), 'count'),
        fallback: 3,
        minimum: 0,
        enforceInteger: true,
      });
      return [
        {
          kind: 'loop',
          mode: 'counted',
          iterations: countBinding,
          instructions: inner,
          sourceBlockId,
        },
      ];
    }
    case 'parallel': {
      const branchA = compileSequence(block.slots?.branchA, diagnostics, context);
      const branchB = compileSequence(block.slots?.branchB, diagnostics, context);
      if (branchA.length === 0 && branchB.length === 0) {
        return [];
      }
      if (!context.unsupportedBlocks.has(block.type)) {
        diagnostics.push({
          severity: 'warning',
          message: 'Parallel blocks execute their branches sequentially in this build.',
        });
        context.unsupportedBlocks.add(block.type);
      }
      return [...branchA, ...branchB];
    }
    case 'forever': {
      const inner = compileSequence(block.slots?.do, diagnostics, context);
      if (inner.length === 0) {
        diagnostics.push({
          severity: 'warning',
          message: 'Forever block has no actions and will be ignored.',
        });
        return [];
      }
      return [
        {
          kind: 'loop',
          mode: 'forever',
          instructions: inner,
          sourceBlockId,
        },
      ];
    }
    case 'if': {
      const thenInstructions = compileSequence(block.slots?.then, diagnostics, context);
      const elseInstructions = compileSequence(block.slots?.else, diagnostics, context);

      if (thenInstructions.length === 0 && elseInstructions.length === 0) {
        diagnostics.push({
          severity: 'warning',
          message: 'If block has no actions in either branch and will be ignored.',
        });
        return [];
      }

      const conditionBinding = resolveBooleanBinding(block, 'condition', diagnostics, {
        label: formatParameterLabel(getBlockLabel('if'), 'condition'),
        fallback: true,
      });

      return [
        {
          kind: 'branch',
          condition: conditionBinding,
          whenTrue: thenInstructions,
          whenFalse: elseInstructions,
          sourceBlockId,
        },
      ];
    }
    case 'wait-signal':
    case 'broadcast-signal':
    default: {
      if (!context.unsupportedBlocks.has(block.type)) {
        diagnostics.push({
          severity: 'warning',
          message: `The ${block.type} block is not runnable yet and will be ignored.`,
        });
        context.unsupportedBlocks.add(block.type);
      }
      return [];
    }
  }
};

export const compileWorkspaceProgram = (workspace: WorkspaceState): CompilationResult => {
  const diagnostics: Diagnostic[] = [];
  const context = createContext();

  const startBlocks = workspace.filter((block) => block.type === 'start');
  if (startBlocks.length === 0) {
    diagnostics.push({
      severity: 'error',
      message: 'Add a "When Started" block to trigger the routine.',
    });
    return { program: { instructions: [] }, diagnostics };
  }

  const entry = startBlocks[0];
  const instructions = compileSequence(entry.slots?.do, diagnostics, context);

  if (instructions.length === 0) {
    diagnostics.push({
      severity: 'warning',
      message: 'Place movement or wait blocks under "When Started" to see the mechanism react.',
    });
  }

  return {
    program: { instructions },
    diagnostics,
  } satisfies CompilationResult;
};
