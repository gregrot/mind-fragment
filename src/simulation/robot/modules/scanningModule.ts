import { RobotModule } from '../RobotModule';
import type { ModulePort } from '../moduleBus';
import type { ModuleActionContext, ModuleUpdateContext } from '../RobotChassis';

const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

interface ScanPayload {
  rangeOverride?: number;
  resourceType?: string;
}

export interface ScanningModuleOptions {
  scanRange?: number;
  cooldownSeconds?: number;
}

export class ScanningModule extends RobotModule {
  private readonly defaultScanRange: number;
  private readonly defaultCooldown: number;
  private port: ModulePort | null = null;
  private cooldownRemaining = 0;
  private scanSequence = 0;

  constructor({ scanRange = 240, cooldownSeconds = 2 }: ScanningModuleOptions = {}) {
    super({
      id: 'sensor.survey',
      title: 'Survey Scanner Suite',
      provides: ['scanning.survey'],
      attachment: { slot: 'sensor', index: 0 },
      capacityCost: 1,
    });
    this.defaultScanRange = scanRange;
    this.defaultCooldown = Math.max(cooldownSeconds, 0.5);
  }

  override onAttach(port: ModulePort): void {
    this.port = port;
    this.cooldownRemaining = 0;
    this.scanSequence = 0;

    port.publishValue('scanRange', this.defaultScanRange, {
      label: 'Scan range',
      unit: 'units',
    });
    port.publishValue('cooldownSeconds', this.defaultCooldown, {
      label: 'Cooldown period',
      unit: 's',
    });
    port.publishValue('cooldownRemaining', 0, {
      label: 'Cooldown remaining',
      unit: 's',
    });
    port.publishValue('lastScan', null, {
      label: 'Last scan result',
    });

    port.registerAction(
      'scan',
      (payload, context) => this.performScan(payload, context),
      {
        label: 'Sweep area',
        summary: 'Emit a survey pulse and record the projected hit location.',
        parameters: [
          { key: 'rangeOverride', label: 'Range override', unit: 'units' },
          { key: 'resourceType', label: 'Resource filter' },
        ],
      },
    );
  }

  override onDetach(): void {
    this.port?.unregisterAction('scan');
    this.port = null;
  }

  override update({ stepSeconds }: ModuleUpdateContext): void {
    if (!this.port || this.cooldownRemaining <= 0) {
      return;
    }
    this.cooldownRemaining = Math.max(this.cooldownRemaining - stepSeconds, 0);
    this.port.updateValue('cooldownRemaining', roundTo(this.cooldownRemaining, 2));
  }

  private performScan(payload: unknown, context: unknown): Record<string, unknown> {
    if (!this.port) {
      return { status: 'inactive' };
    }

    const typedContext = context as ModuleActionContext;
    const typedPayload = (payload ?? {}) as ScanPayload;

    if (this.cooldownRemaining > 0) {
      return { status: 'cooldown', remaining: roundTo(this.cooldownRemaining, 2) };
    }

    const state = typedContext.state;
    const range = Math.max(
      10,
      Math.min(
        Number.isFinite(typedPayload.rangeOverride) ? (typedPayload.rangeOverride as number) : this.port.getValue<number>('scanRange') ?? this.defaultScanRange,
        this.defaultScanRange * 2,
      ),
    );

    const targetX = state.position.x + Math.cos(state.orientation) * range;
    const targetY = state.position.y + Math.sin(state.orientation) * range;

    const resourceScan = typedContext.utilities.resourceField.scan({
      origin: state.position,
      orientation: state.orientation,
      range,
      resourceType: typedPayload.resourceType,
    });

    this.scanSequence += 1;
    const result = {
      status: 'ok',
      origin: { x: roundTo(state.position.x, 2), y: roundTo(state.position.y, 2) },
      target: { x: roundTo(targetX, 2), y: roundTo(targetY, 2) },
      orientation: roundTo(state.orientation, 3),
      range: roundTo(range, 2),
      sequence: this.scanSequence,
      filter: resourceScan.filter,
      resources: {
        filter: resourceScan.filter,
        hits: resourceScan.hits.map((hit) => ({
          id: hit.id,
          type: hit.type,
          position: { x: roundTo(hit.position.x, 2), y: roundTo(hit.position.y, 2) },
          quantity: hit.quantity,
          distance: roundTo(hit.distance, 2),
        })),
        total: resourceScan.total,
      },
    };

    this.cooldownRemaining = this.port.getValue<number>('cooldownSeconds') ?? this.defaultCooldown;
    this.port.updateValue('cooldownRemaining', roundTo(this.cooldownRemaining, 2));
    this.port.updateValue('lastScan', result);

    return result;
  }
}
