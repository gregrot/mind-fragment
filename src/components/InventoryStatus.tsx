import useInventoryTelemetry from '../hooks/useInventoryTelemetry';

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
    <section className="inventory-status" aria-labelledby="inventory-status-heading" data-testid="inventory-status">
      <header className="inventory-status-header">
        <h3 id="inventory-status-heading">Cargo Inventory</h3>
        <p className="inventory-status-capacity" data-testid="inventory-capacity">
          <strong>{Math.round(snapshot.used)}</strong>
          <span aria-hidden="true"> / </span>
          {Math.round(snapshot.capacity)} units occupied
        </p>
      </header>
      {hasContents ? (
        <ul className="inventory-status-list" data-testid="inventory-contents">
          {snapshot.entries.map((entry) => (
            <li key={entry.resource} className="inventory-status-entry">
              <span className="inventory-resource-name">{formatResourceName(entry.resource)}</span>
              <span className="inventory-resource-quantity">{formatUnits(entry.quantity)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="inventory-status-empty">No resources stored yet. Run a gather routine to collect materials.</p>
      )}
    </section>
  );
};

export default InventoryStatus;
