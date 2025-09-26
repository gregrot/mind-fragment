import { useEffect, useState } from 'react';
import type { InventorySnapshot } from '../simulation/mechanism/inventory';
import { inventoryState } from '../state/runtime';

export const useInventoryTelemetry = (): InventorySnapshot => {
  const [snapshot, setSnapshot] = useState<InventorySnapshot>(inventoryState.getSnapshot());

  useEffect(() => inventoryState.subscribe(setSnapshot), []);

  return snapshot;
};

export default useInventoryTelemetry;
