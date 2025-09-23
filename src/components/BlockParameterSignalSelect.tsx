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
import styles from '../styles/BlockView.module.css';

interface BlockParameterSignalSelectProps {
  block: BlockInstance;
  parameterName: string;
  definition: Extract<BlockParameterDefinition, { kind: 'signal' }>;
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

const BlockParameterSignalSelect = ({
  block,
  parameterName,
  definition,
  value,
  label,
  testId,
  onUpdateBlock,
}: BlockParameterSignalSelectProps): JSX.Element => {
  const selectedValue = value?.kind === 'signal' ? value.value : definition.defaultValue ?? null;

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
      {definition.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export default BlockParameterSignalSelect;
