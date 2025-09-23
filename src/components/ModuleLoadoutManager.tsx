import { useCallback } from 'react';
import type { DragEvent } from 'react';
import { getModuleBlueprint } from '../simulation/robot/modules/moduleLibrary';
import type { ModuleBlueprint } from '../simulation/robot/modules/moduleLibrary';
import type { ModuleStateSnapshot } from '../simulation/robot/RobotChassis';
import { simulationRuntime } from '../state/simulationRuntime';
import useModuleState from '../hooks/useModuleState';
import styles from '../styles/ModuleLoadoutManager.module.css';

const MODULE_DRAG_DATA = 'application/x-module-id';
const MODULE_DRAG_SOURCE = 'application/x-module-source';

const getBlueprint = (moduleId: string): ModuleBlueprint | null => getModuleBlueprint(moduleId);

const formatQuantity = (quantity: number): string => `${quantity}×`;

const formatDistance = (distance: number): string => `${distance.toFixed(1)}u`;

const ModuleLoadoutManager = (): JSX.Element => {
  const moduleState = useModuleState();

  const handleDragStart = useCallback((moduleId: string, source: 'mounted' | 'inventory') => {
    return (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer?.setData(MODULE_DRAG_DATA, moduleId);
      event.dataTransfer?.setData(MODULE_DRAG_SOURCE, source);
      event.dataTransfer.effectAllowed = 'move';
    };
  }, []);

  const handleInventoryDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const moduleId = event.dataTransfer?.getData(MODULE_DRAG_DATA);
    const source = event.dataTransfer?.getData(MODULE_DRAG_SOURCE);
    if (!moduleId || source !== 'mounted') {
      return;
    }
    event.preventDefault();
    void simulationRuntime.storeModule(moduleId);
  }, []);

  const handleMountedDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const moduleId = event.dataTransfer?.getData(MODULE_DRAG_DATA);
    const source = event.dataTransfer?.getData(MODULE_DRAG_SOURCE);
    if (!moduleId || source !== 'inventory') {
      return;
    }
    event.preventDefault();
    void simulationRuntime.mountModule(moduleId);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer?.types.includes(MODULE_DRAG_DATA)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const renderMountedModules = (snapshot: ModuleStateSnapshot) => {
    if (snapshot.installed.length === 0) {
      return <div className={styles.empty}>No modules mounted.</div>;
    }
    return snapshot.installed.map((entry) => {
      const blueprint = getBlueprint(entry.id);
      return (
        <div
          key={entry.id}
          className={styles.card}
          draggable
          onDragStart={handleDragStart(entry.id, 'mounted')}
        >
          <div className={styles.cardTitle}>{blueprint?.title ?? entry.id}</div>
          <div className={styles.cardMeta}>{`${entry.slot.toUpperCase()} · ${entry.index}`}</div>
          <div className={styles.cardActions}>
            <button type="button" onClick={() => void simulationRuntime.storeModule(entry.id)}>
              Store in inventory
            </button>
          </div>
        </div>
      );
    });
  };

  const renderInventoryModules = (snapshot: ModuleStateSnapshot) => {
    if (snapshot.inventory.length === 0) {
      return <div className={styles.empty}>Inventory is empty.</div>;
    }
    return snapshot.inventory.map((entry) => {
      const blueprint = getBlueprint(entry.id);
      return (
        <div
          key={entry.id}
          className={styles.card}
          draggable
          onDragStart={handleDragStart(entry.id, 'inventory')}
        >
          <div className={styles.cardTitle}>{blueprint?.title ?? entry.id}</div>
          <div className={styles.cardMeta}>{formatQuantity(entry.quantity)}</div>
          <div className={styles.cardActions}>
            <button type="button" onClick={() => void simulationRuntime.mountModule(entry.id)}>
              Mount
            </button>
            <button type="button" onClick={() => void simulationRuntime.dropModule(entry.id)}>
              Drop
            </button>
          </div>
        </div>
      );
    });
  };

  const renderGroundModules = (snapshot: ModuleStateSnapshot) => {
    if (snapshot.ground.length === 0) {
      return <div className={styles.empty}>No modules nearby.</div>;
    }
    return snapshot.ground.map((entry) => {
      const blueprint = getBlueprint(entry.moduleId);
      return (
        <div key={entry.nodeId} className={styles.card}>
          <div className={styles.cardTitle}>{blueprint?.title ?? entry.moduleId}</div>
          <div className={styles.cardMeta}>{`${formatQuantity(entry.quantity)} · ${formatDistance(entry.distance)}`}</div>
          <div className={styles.cardActions}>
            <button type="button" onClick={() => void simulationRuntime.pickUpModule(entry.nodeId)}>
              Pick up
            </button>
          </div>
        </div>
      );
    });
  };

  return (
    <div className={styles.manager}>
      <section className={styles.section} aria-labelledby="module-loadout-mounted">
        <header className={styles.sectionHeader}>
          <h4 id="module-loadout-mounted">Mounted modules</h4>
          <p>Drag modules here to install them onto the chassis.</p>
        </header>
        <div className={styles.dropZone} onDragOver={handleDragOver} onDrop={handleMountedDrop}>
          {renderMountedModules(moduleState)}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="module-loadout-inventory">
        <header className={styles.sectionHeader}>
          <h4 id="module-loadout-inventory">Module inventory</h4>
          <p>Drag mounted modules here or use actions to stash and deploy hardware.</p>
        </header>
        <div className={styles.dropZone} onDragOver={handleDragOver} onDrop={handleInventoryDrop}>
          {renderInventoryModules(moduleState)}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="module-loadout-ground">
        <header className={styles.sectionHeader}>
          <h4 id="module-loadout-ground">Nearby modules</h4>
          <p>Retrieve loose hardware detected around the chassis.</p>
        </header>
        <div className={styles.groundList}>{renderGroundModules(moduleState)}</div>
      </section>
    </div>
  );
};

export default ModuleLoadoutManager;
