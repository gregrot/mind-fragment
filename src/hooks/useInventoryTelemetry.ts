import { useEffect, useState } from 'react';
import type { InventorySnapshot } from '../simulation/mechanism/inventory';
import { simulationRuntime } from '../state/simulationRuntime';

export const useInventoryTelemetry = (): InventorySnapshot => {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(simulationRuntime.getInventorySnapshot());

  useEffect(() => simulationRuntime.subscribeInventory(setSnapshot), []);

  return snapshot;
};

export default useInventoryTelemetry;
