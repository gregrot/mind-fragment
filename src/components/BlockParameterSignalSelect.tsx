import {
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import type {
  BlockInstance,
  BlockParameterDefinition,
  BlockParameterValue,
} from '../types/blocks';
import type { RobotTelemetryData } from '../hooks/useRobotTelemetry';
import styles from '../styles/BlockView.module.css';

interface BlockParameterSignalSelectProps {
  block: BlockInstance;
  parameterName: string;
  definition: Extract<BlockParameterDefinition, { kind: 'signal' }>;
  value: BlockParameterValue | undefined;
  label: string;
  testId: string;
  onUpdateBlock?: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
  telemetry?: RobotTelemetryData;
}

const stopPropagation = (
  event: MouseEvent<HTMLElement> | ReactTouchEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
): void => {
  event.stopPropagation();
};

const BlockParameterSignalSelect = ({
  block,
  parameterName,
  definition,
  value,
  label,
  testId,
  onUpdateBlock,
  telemetry,
}: BlockParameterSignalSelectProps): JSX.Element => {
  const selectedValue = value?.kind === 'signal' ? value.value : definition.defaultValue ?? null;

  const seenValues = new Set<string>();
  const telemetryOptions = (telemetry?.modules ?? [])
    .filter((module) => module.signals.length > 0)
    .map((module) => (
      <optgroup key={`telemetry-${module.moduleId}`} label={module.label}>
        {module.signals.map((signal) => {
          seenValues.add(signal.id);
          return (
            <option key={signal.id} value={signal.id}>
              {signal.label}
            </option>
          );
        })}
      </optgroup>
    ));

  const fallbackMap = new Map(definition.options?.map((option) => [option.id, option.label]));

  const fallbackOptions = (definition.options ?? [])
    .filter((option) => !seenValues.has(option.id))
    .map((option) => {
      seenValues.add(option.id);
      return (
        <option key={`fallback-${option.id}`} value={option.id}>
          {option.label}
        </option>
      );
    });

  const shouldIncludeSelectedFallback =
    typeof selectedValue === 'string' &&
    selectedValue.length > 0 &&
    !seenValues.has(selectedValue);

  if (shouldIncludeSelectedFallback) {
    const derivedLabel = fallbackMap.get(selectedValue) ?? formatSignalIdentifier(selectedValue);
    fallbackOptions.push(
      <option key={`selected-${selectedValue}`} value={selectedValue}>
        {derivedLabel}
      </option>,
    );
    seenValues.add(selectedValue);
  }

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      if (!onUpdateBlock) {
        return;
      }

      const nextValue = event.target.value === '' ? null : event.target.value;
      onUpdateBlock(block.instanceId, (current) => {
        const currentParameters = { ...(current.parameters ?? {}) };
        return {
          ...current,
          parameters: {
            ...currentParameters,
            [parameterName]: { kind: 'signal', value: nextValue },
          },
        };
      });
    },
    [block.instanceId, onUpdateBlock, parameterName],
  );

  return (
    <select
      className={styles.blockSelect}
      value={selectedValue ?? ''}
      onChange={handleChange}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onKeyDown={stopPropagation}
      disabled={!onUpdateBlock}
      data-testid={testId}
      aria-label={`${label} signal`}
    >
      {definition.allowNone !== false ? (
        <option value="">None</option>
      ) : null}
      {telemetryOptions}
      {fallbackOptions}
    </select>
  );
};

const formatSignalIdentifier = (identifier: string): string =>
  identifier
    .split('.')
    .map((segment) =>
      segment
        .replace(/[-_]/g, ' ')
        .replace(/\b[a-z]/g, (character) => character.toUpperCase()),
    )
    .join(' – ');

export default BlockParameterSignalSelect;
