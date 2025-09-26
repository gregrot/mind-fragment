import { MechanismModule } from '../MechanismModule';
import type { ModulePort } from '../moduleBus';

export const STATUS_MODULE_ID = 'status.signal';

interface SetStatusPayload {
  value?: unknown;
}

interface ToggleResult {
  status: 'ok';
  active: boolean;
}

interface SetResult {
  status: 'ok' | 'invalid';
  active: boolean;
}

export class StatusModule extends MechanismModule {
  private port: ModulePort | null = null;
  private active = false;

  constructor() {
    super({
      id: STATUS_MODULE_ID,
      title: 'Status Indicator',
      provides: ['status.signal'],
      attachment: { slot: 'core', index: 2 },
      capacityCost: 1,
    });
  }

  override onAttach(port: ModulePort): void {
    this.port = port;
    this.active = false;

    port.publishValue('defaultState', false, {
      label: 'Default state',
      description: 'Initial activation state for the indicator light.',
    });
    port.publishValue('active', this.active, {
      label: 'Indicator active',
      description: 'Whether the status light is currently illuminated.',
    });

    port.registerAction(
      'toggleStatus',
      () => this.toggle(),
      {
        label: 'Toggle status',
        summary: 'Flip the status indicator between on and off.',
      },
    );

    port.registerAction(
      'setStatus',
      (payload) => this.set(payload),
      {
        label: 'Set status',
        summary: 'Force the status indicator on or off based on the provided flag.',
        parameters: [{ key: 'value', label: 'Active', description: 'True to enable the indicator, false to disable.' }],
      },
    );
  }

  override onDetach(): void {
    this.port?.unregisterAction('toggleStatus');
    this.port?.unregisterAction('setStatus');
    this.port = null;
  }

  private toggle(): ToggleResult {
    if (!this.port) {
      return { status: 'ok', active: this.active };
    }
    this.active = !this.active;
    this.port.updateValue('active', this.active);
    return { status: 'ok', active: this.active };
  }

  private set(payload: unknown): SetResult {
    if (!this.port) {
      return { status: 'ok', active: this.active };
    }
    const typed = (payload ?? {}) as SetStatusPayload;
    if (typeof typed.value !== 'boolean') {
      return { status: 'invalid', active: this.active };
    }
    this.active = typed.value;
    this.port.updateValue('active', this.active);
    return { status: 'ok', active: this.active };
  }
}
