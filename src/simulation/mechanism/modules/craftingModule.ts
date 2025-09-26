import { MechanismModule } from '../MechanismModule';
import type { ModulePort } from '../moduleBus';
import type { ModuleUpdateContext } from '../MechanismChassis';

interface CraftTask {
  recipe: string;
  duration: number;
  elapsed: number;
  sequence: number;
}

interface QueuePayload {
  recipe?: string;
  duration?: number;
}

interface CancelPayload {
  recipe?: string;
}

const ensureDuration = (value: unknown, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const duration = Math.max((value as number) ?? fallback, 0.25);
  return duration;
};

export interface CraftingModuleOptions {
  defaultDuration?: number;
}

export class CraftingModule extends MechanismModule {
  private readonly defaultDuration: number;
  private port: ModulePort | null = null;
  private readonly queue: CraftTask[] = [];
  private activeTask: CraftTask | null = null;
  private completedSequence = 0;

  constructor({ defaultDuration = 3 }: CraftingModuleOptions = {}) {
    super({
      id: 'fabricator.basic',
      title: 'Field Fabricator',
      provides: ['crafting.basic'],
      requires: ['manipulation.grip'],
      attachment: { slot: 'extension', index: 1 },
      capacityCost: 2,
    });

    this.defaultDuration = defaultDuration;
  }

  override onAttach(port: ModulePort): void {
    this.port = port;
    this.queue.length = 0;
    this.activeTask = null;
    this.completedSequence = 0;

    port.publishValue('defaultDuration', this.defaultDuration, {
      label: 'Default craft duration',
      unit: 's',
    });
    port.publishValue('queueLength', 0, {
      label: 'Craft queue length',
    });
    port.publishValue('activeRecipe', null, {
      label: 'Active recipe',
    });
    port.publishValue('lastCompleted', null, {
      label: 'Last completed recipe',
    });

    port.registerAction(
      'queueRecipe',
      (payload) => this.queueRecipe(payload),
      {
        label: 'Queue recipe',
        summary: 'Add a recipe to the fabrication queue with an optional duration override.',
        parameters: [
          { key: 'recipe', label: 'Recipe id' },
          { key: 'duration', label: 'Craft duration', unit: 's' },
        ],
      },
    );

    port.registerAction(
      'cancelRecipe',
      (payload) => this.cancelRecipe(payload),
      {
        label: 'Cancel recipe',
        summary: 'Remove the first queued recipe matching the supplied identifier.',
        parameters: [{ key: 'recipe', label: 'Recipe id' }],
      },
    );
  }

  override onDetach(): void {
    this.port?.unregisterAction('queueRecipe');
    this.port?.unregisterAction('cancelRecipe');
    this.port = null;
    this.queue.length = 0;
    this.activeTask = null;
  }

  override update({ stepSeconds }: ModuleUpdateContext): void {
    if (!this.port) {
      return;
    }

    if (!this.activeTask && this.queue.length > 0) {
      this.activeTask = this.queue.shift() ?? null;
      this.port.updateValue('queueLength', this.queue.length);
      if (this.activeTask) {
        this.port.updateValue('activeRecipe', {
          recipe: this.activeTask.recipe,
          remaining: ensureDuration(this.activeTask.duration, this.defaultDuration),
          sequence: this.activeTask.sequence,
        });
      }
    }

    if (!this.activeTask) {
      return;
    }

    this.activeTask.elapsed += stepSeconds;
    const remaining = Math.max(this.activeTask.duration - this.activeTask.elapsed, 0);
    this.port.updateValue('activeRecipe', {
      recipe: this.activeTask.recipe,
      remaining,
      sequence: this.activeTask.sequence,
    });

    if (remaining > 0) {
      return;
    }

    this.completedSequence += 1;
    this.port.updateValue('lastCompleted', {
      recipe: this.activeTask.recipe,
      sequence: this.completedSequence,
    });
    this.activeTask = null;
    this.port.updateValue('activeRecipe', null);
  }

  private queueRecipe(payload: unknown): { recipe: string; queueLength: number } {
    if (!this.port) {
      return { recipe: 'unknown', queueLength: 0 };
    }
    const typedPayload = (payload ?? {}) as QueuePayload;
    const recipe = typedPayload.recipe ?? 'basic-alloy';
    const duration = ensureDuration(typedPayload.duration, this.defaultDuration);
    const lastSequence = this.queue.length > 0 ? this.queue[this.queue.length - 1]?.sequence ?? 0 : 0;
    const task: CraftTask = {
      recipe,
      duration,
      elapsed: 0,
      sequence: lastSequence + 1,
    };
    this.queue.push(task);
    this.port.updateValue('queueLength', this.queue.length);
    return { recipe, queueLength: this.queue.length };
  }

  private cancelRecipe(payload: unknown): { removed: boolean; queueLength: number } {
    if (!this.port) {
      return { removed: false, queueLength: 0 };
    }
    const typedPayload = (payload ?? {}) as CancelPayload;
    const recipe = typedPayload.recipe;
    if (typeof recipe !== 'string') {
      return { removed: false, queueLength: this.queue.length };
    }

    const index = this.queue.findIndex((task) => task.recipe === recipe);
    if (index === -1) {
      return { removed: false, queueLength: this.queue.length };
    }
    this.queue.splice(index, 1);
    this.port.updateValue('queueLength', this.queue.length);
    return { removed: true, queueLength: this.queue.length };
  }
}
