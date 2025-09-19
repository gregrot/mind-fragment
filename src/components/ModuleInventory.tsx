import ModuleIcon from './ModuleIcon';
import {
  MODULE_LIBRARY,
  DEFAULT_MODULE_LOADOUT,
  type ModuleBlueprint,
} from '../simulation/robot/modules/moduleLibrary';

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
          <span className="module-field-label">{parameter.label}</span>
          {parameter.unit ? <span className="module-field-unit">{parameter.unit}</span> : null}
          {parameter.description ? <small>{parameter.description}</small> : null}
        </li>
      ))}
    </ul>
  );

  const renderActions = (module: ModuleBlueprint) => (
    <ul>
      {module.actions.map((action) => (
        <li key={action.name}>
          <span className="module-field-label">{action.label}</span>
          <small>{action.description}</small>
        </li>
      ))}
    </ul>
  );

  const renderTelemetry = (module: ModuleBlueprint) => (
    <ul>
      {module.telemetry.map((entry) => (
        <li key={entry.key}>
          <span className="module-field-label">{entry.label}</span>
          <small>{entry.description}</small>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="module-inventory" aria-labelledby="module-inventory-heading">
      <h3 id="module-inventory-heading">Module Catalogue</h3>
      <p className="module-inventory-summary">
        The catalogue lists every module available in the MVP along with its programmable hooks and telemetry channels.
      </p>
      <ul className="module-list" role="list">
        {MODULE_LIBRARY.map((module) => {
          const isInstalled = installed.has(module.id);
          return (
            <li
              key={module.id}
              className="module-card"
              data-status={isInstalled ? 'installed' : 'available'}
              data-testid={`module-card-${module.id}`}
            >
              <div className="module-card-header">
                <ModuleIcon variant={module.icon} />
                <div className="module-card-title">
                  <h4>{module.title}</h4>
                  <p>{module.summary}</p>
                </div>
                <div className="module-card-meta-pill">
                  <span className={`module-status module-status-${isInstalled ? 'installed' : 'available'}`}>
                    {isInstalled ? 'Installed' : 'Available'}
                  </span>
                  <span className="module-slot">{`${module.attachment.slot} · ${module.attachment.index}`}</span>
                </div>
              </div>
              <dl className="module-card-details">
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
              <div className="module-card-section">
                <h5>Parameters</h5>
                {renderParameters(module)}
              </div>
              <div className="module-card-section">
                <h5>Block Hooks</h5>
                {renderActions(module)}
              </div>
              <div className="module-card-section">
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
