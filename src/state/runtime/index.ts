export { InventoryState, type InventoryListener, type InventoryOverlayUpdate, EMPTY_INVENTORY_SNAPSHOT } from './inventoryState';
export { ChassisState, type ChassisListener, type ChassisOverlayUpdate, EMPTY_CHASSIS_SNAPSHOT } from './chassisState';
export { TelemetryState, type TelemetryListener, EMPTY_TELEMETRY_SNAPSHOT } from './telemetryState';

import { InventoryState } from './inventoryState';
import { ChassisState } from './chassisState';
import { TelemetryState } from './telemetryState';

export const inventoryState = new InventoryState();
export const chassisState = new ChassisState();
export const telemetryState = new TelemetryState();
