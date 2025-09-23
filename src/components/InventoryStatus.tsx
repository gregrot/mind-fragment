import useInventoryTelemetry from '../hooks/useInventoryTelemetry';
import ModuleLoadoutManager from './ModuleLoadoutManager';
import styles from '../styles/InventoryStatus.module.css';

const formatResourceName = (resource: string): string =>
  resource
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const formatUnits = (value: number): string => `${Math.round(value)} units`;

const InventoryStatus = (): JSX.Element => {
  const snapshot = useInventoryTelemetry();
  const hasContents = snapshot.entries.length > 0;

  return (
    <div className={styles.wrapper} data-testid="inventory-status">
      <section className={styles.inventory} aria-labelledby="inventory-status-heading">
        <header className={styles.header}>
          <h3 id="inventory-status-heading" className={styles.title}>
            Cargo Inventory
          </h3>
          <p className={styles.capacity} data-testid="inventory-capacity">
            <strong className={styles.capacityValue}>{Math.round(snapshot.used)}</strong>
            <span aria-hidden="true"> / </span>
            {Math.round(snapshot.capacity)} units occupied
          </p>
        </header>
        {hasContents ? (
          <ul className={styles.list} data-testid="inventory-contents">
            {snapshot.entries.map((entry) => (
              <li key={entry.resource} className={styles.entry}>
                <span className={styles.name}>{formatResourceName(entry.resource)}</span>
                <span className={styles.quantity}>{formatUnits(entry.quantity)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No resources stored yet. Run a gather routine to collect materials.</p>
        )}
      </section>
      <ModuleLoadoutManager />
    </div>
  );
};

export default InventoryStatus;
