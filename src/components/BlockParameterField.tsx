import {
  useCallback,
  useEffect,
  useMemo,
  useState,
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
import styles from '../styles/BlockView.module.css';

interface BlockParameterFieldProps {
  block: BlockInstance;
  parameterName: string;
  definition: Extract<BlockParameterDefinition, { kind: 'boolean' | 'number' | 'string' }>;
  value: BlockParameterValue | undefined;
  label: string;
  testId: string;
  onUpdateBlock?: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
}

const stopPropagation = (
  event: MouseEvent<HTMLElement> | ReactTouchEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
): void => {
  event.stopPropagation();
};

const PARTIAL_NUMBER_PATTERN = /^-?\d*(\.\d*)?$/;

const BlockParameterField = ({
  block,
  parameterName,
  definition,
  value,
  label,
  testId,
  onUpdateBlock,
}: BlockParameterFieldProps): JSX.Element => {
  const [numberDraft, setNumberDraft] = useState<string>(() => {
    if (definition.kind === 'number') {
      const initialValue = value?.kind === 'number' ? value.value : definition.defaultValue;
      return Number.isFinite(initialValue) ? String(initialValue) : '';
    }

    return '';
  });

  const resolvedValue = useMemo(() => {
    switch (definition.kind) {
      case 'boolean':
        return value?.kind === 'boolean' ? value.value : definition.defaultValue;
      case 'number':
        return value?.kind === 'number' ? value.value : definition.defaultValue;
      case 'string':
      default:
        return value?.kind === 'string' ? value.value : definition.defaultValue;
    }
  }, [definition, value]);

  useEffect(() => {
    if (definition.kind !== 'number') {
      return;
    }

    const nextValue = value?.kind === 'number' ? value.value : definition.defaultValue;
    setNumberDraft(Number.isFinite(nextValue) ? String(nextValue) : '');
  }, [definition, value]);

  const updateParameter = useCallback(
    (nextValue: BlockParameterValue): void => {
      if (!onUpdateBlock) {
        return;
      }

      onUpdateBlock(block.instanceId, (current) => {
        const currentParameters = { ...(current.parameters ?? {}) };
        return {
          ...current,
          parameters: {
            ...currentParameters,
            [parameterName]: nextValue,
          },
        };
      });
    },
    [block.instanceId, onUpdateBlock, parameterName],
  );

  const handleBooleanClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      const defaultValue = definition.kind === 'boolean' ? definition.defaultValue : false;
      const currentValue = value?.kind === 'boolean' ? value.value : defaultValue;
      updateParameter({ kind: 'boolean', value: !currentValue });
    },
    [definition, updateParameter, value],
  );

  const handleNumberChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      if (!PARTIAL_NUMBER_PATTERN.test(nextValue)) {
        return;
      }

      setNumberDraft(nextValue);

      if (
        nextValue === ''
        || nextValue === '-'
        || nextValue === '.'
        || nextValue === '-.'
        || nextValue.endsWith('.')
      ) {
        return;
      }

      const parsed = Number(nextValue);
      if (Number.isNaN(parsed)) {
        return;
      }

      updateParameter({ kind: 'number', value: parsed });
    },
    [updateParameter],
  );

  const handleNumberBlur = useCallback(() => {
    if (definition.kind !== 'number') {
      return;
    }

    const trimmed = numberDraft.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
      const fallback = definition.defaultValue;
      setNumberDraft(String(fallback));
      updateParameter({ kind: 'number', value: fallback });
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isNaN(parsed)) {
      const fallback = definition.defaultValue;
      setNumberDraft(String(fallback));
      updateParameter({ kind: 'number', value: fallback });
      return;
    }

    setNumberDraft(String(parsed));
    updateParameter({ kind: 'number', value: parsed });
  }, [definition, numberDraft, updateParameter]);

  const handleStringChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateParameter({ kind: 'string', value: event.target.value });
    },
    [updateParameter],
  );

  if (definition.kind === 'boolean') {
    const isActive = Boolean(resolvedValue);
    return (
      <button
        type="button"
        className={styles.blockToggle}
        onMouseDown={stopPropagation}
        onTouchStart={stopPropagation}
        onKeyDown={stopPropagation}
        onClick={handleBooleanClick}
        disabled={!onUpdateBlock}
        data-testid={testId}
        aria-label={`${label} toggle`}
      >
        {isActive ? 'true' : 'false'}
      </button>
    );
  }

  if (definition.kind === 'number') {
    return (
      <input
        type="number"
        className={styles.blockInput}
        value={numberDraft}
        min={definition.min}
        max={definition.max}
        step={definition.step ?? 'any'}
        readOnly={!onUpdateBlock}
        onChange={handleNumberChange}
        onMouseDown={stopPropagation}
        onTouchStart={stopPropagation}
        onKeyDown={stopPropagation}
        onBlur={handleNumberBlur}
        data-testid={testId}
        aria-label={`${label} value`}
        inputMode="decimal"
      />
    );
  }

  return (
    <input
      type="text"
      className={styles.blockInput}
      value={typeof resolvedValue === 'string' ? resolvedValue : ''}
      readOnly={!onUpdateBlock}
      onChange={handleStringChange}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onKeyDown={stopPropagation}
      data-testid={testId}
      aria-label={`${label} value`}
    />
  );
};

export default BlockParameterField;
