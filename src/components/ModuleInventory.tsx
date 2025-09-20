import ModuleIcon from './ModuleIcon';
import {
  MODULE_LIBRARY,
  DEFAULT_MODULE_LOADOUT,
  type ModuleBlueprint,
} from '../simulation/robot/modules/moduleLibrary';
import styles from '../styles/ModuleInventory.module.css';

const renderList = (items: string[]): string => {
  if (items.length === 0) {
    return 'None';
  }
  return items.join(', ');
};

const ModuleInventory = (): JSX.Element => {
  const installed = new Set(DEFAULT_MODULE_LOADOUT);

  const renderParameters = (module: ModuleBlueprint) => (
    <ul>
      {module.parameters.map((parameter) => (
        <li key={parameter.key}>
          <span className={styles.fieldLabel}>{parameter.label}</span>
          {parameter.unit ? <span className={styles.fieldUnit}>{parameter.unit}</span> : null}
          {parameter.description ? <small>{parameter.description}</small> : null}
        </li>
      ))}
    </ul>
  );

  const renderActions = (module: ModuleBlueprint) => (
    <ul>
      {module.actions.map((action) => (
        <li key={action.name}>
          <span className={styles.fieldLabel}>{action.label}</span>
          <small>{action.description}</small>
        </li>
      ))}
    </ul>
  );

  const renderTelemetry = (module: ModuleBlueprint) => (
    <ul>
      {module.telemetry.map((entry) => (
        <li key={entry.key}>
          <span className={styles.fieldLabel}>{entry.label}</span>
          <small>{entry.description}</small>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={styles.inventory} aria-labelledby="module-inventory-heading">
      <h3 id="module-inventory-heading" className={styles.heading}>
        Module Catalogue
      </h3>
      <p className={styles.summary}>
        The catalogue lists every module available in the MVP along with its programmable hooks and telemetry channels.
      </p>
      <ul className={styles.list} role="list">
        {MODULE_LIBRARY.map((module) => {
          const isInstalled = installed.has(module.id);
          return (
            <li
              key={module.id}
              className={styles.card}
              data-status={isInstalled ? 'installed' : 'available'}
              data-testid={`module-card-${module.id}`}
            >
              <div className={styles.cardHeader}>
                <ModuleIcon variant={module.icon} />
                <div className={styles.cardTitle}>
                  <h4>{module.title}</h4>
                  <p>{module.summary}</p>
                </div>
                <div className={styles.meta}>
                  <span
                    className={`${styles.status} ${isInstalled ? styles.statusInstalled : styles.statusAvailable}`}
                  >
                    {isInstalled ? 'Installed' : 'Available'}
                  </span>
                  <span className={styles.slot}>{`${module.attachment.slot} · ${module.attachment.index}`}</span>
                </div>
              </div>
              <dl className={styles.details}>
                <div>
                  <dt>Provides</dt>
                  <dd>{renderList(module.provides)}</dd>
                </div>
                <div>
                  <dt>Requires</dt>
                  <dd>{renderList(module.requires)}</dd>
                </div>
                <div>
                  <dt>Capacity</dt>
                  <dd>{module.capacityCost}</dd>
                </div>
              </dl>
              <div className={styles.section}>
                <h5>Parameters</h5>
                {renderParameters(module)}
              </div>
              <div className={styles.section}>
                <h5>Block Hooks</h5>
                {renderActions(module)}
              </div>
              <div className={styles.section}>
                <h5>Telemetry</h5>
                {renderTelemetry(module)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ModuleInventory;
