import { useMemo } from 'react';
import type { InspectorProps } from '../../overlay/inspectorRegistry';
import styles from '../../styles/EntityInfoInspector.module.css';

type PropertyEntry = {
  key: string;
  label: string;
  valueText: string;
};

const isDisplayableValue = (value: unknown): boolean => {
  if (value === undefined) {
    return false;
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return false;
  }
  return true;
};

const normaliseLabel = (key: string): string => {
  const withSpaces = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withSpaces) {
    return 'Value';
  }
  return withSpaces
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
};

const formatValue = (value: unknown): string => {
  if (value === null) {
    return 'None';
  }
  if (Array.isArray(value)) {
    return formatArray(value);
  }
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
      return Number.isFinite(value) ? String(value) : '—';
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'bigint':
      return value.toString();
    case 'object':
      return JSON.stringify(value);
    default:
      return '';
  }
};

function formatArray(values: unknown[]): string {
  if (values.length === 0) {
    return 'None';
  }
  return values
    .map((entry) => formatValue(entry))
    .filter((text) => text.length > 0)
    .join(', ');
}

const buildPropertyEntries = (entity: InspectorProps['entity']): PropertyEntry[] => {
  const properties = entity.properties;
  if (!properties) {
    return [];
  }
  return Object.entries(properties)
    .filter(([, value]) => isDisplayableValue(value))
    .map(([key, value]) => ({
      key,
      label: normaliseLabel(key),
      valueText: formatValue(value),
    }))
    .filter((entry) => entry.valueText !== '');
};

const EntityInfoInspector = ({ entity }: InspectorProps): JSX.Element => {
  const titleId = `entity-info-${entity.entityId}`;
  const showSummary = entity.overlayType === 'simple';

  const properties = useMemo(() => buildPropertyEntries(entity), [entity]);

  const summaryClassName = `${styles.summary} ${showSummary ? styles.summarySimple : ''}`.trim();

  return (
    <section className={styles.info} aria-labelledby={titleId} data-testid="entity-info-inspector">
      <header className={summaryClassName}>
        <h3 id={titleId} className={showSummary ? styles.summaryTitle : styles.heading}>
          {showSummary ? entity.name : 'Entity Information'}
        </h3>
        {showSummary ? (
          entity.description ? (
            <p className={styles.description}>{entity.description}</p>
          ) : null
        ) : (
          <div className={styles.summaryDetails}>
            <p className={styles.entityName}>{entity.name}</p>
            <p className={styles.summaryHint}>Key facts about this entity.</p>
          </div>
        )}
      </header>
      {properties.length > 0 ? (
        <dl className={styles.properties}>
          {properties.map((entry) => (
            <div key={entry.key} className={styles.property}>
              <dt className={styles.propertyLabel}>{entry.label}</dt>
              <dd className={styles.propertyValue}>{entry.valueText}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.placeholder}>No additional properties available.</p>
      )}
    </section>
  );
};

export default EntityInfoInspector;
