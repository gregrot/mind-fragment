import type { ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Workspace from '../components/Workspace';
import { createBlockInstance } from '../blocks/library';
import type { WorkspaceState } from '../types/blocks';

const buildWorkspace = (): WorkspaceState => {
  const whenStarted = createBlockInstance('start');
  const scanArea = createBlockInstance('scan-resources');
  const repeatLoop = createBlockInstance('repeat');
  const gatherResource = createBlockInstance('gather-resource');
  const returnHome = createBlockInstance('return-home');

  repeatLoop.slots = {
    do: [gatherResource, returnHome],
  };

  const moveTo = createBlockInstance('move-to');
  const literalX = createBlockInstance('literal-number');
  const literalY = createBlockInstance('literal-number');

  moveTo.parameters = {
    useScanHit: { kind: 'boolean', value: false },
    scanHitIndex: { kind: 'number', value: 1 },
    targetX: { kind: 'number', value: 12 },
    targetY: { kind: 'number', value: -6 },
    speed: { kind: 'number', value: 90 },
  };

  moveTo.expressionInputs = {
    targetX: [literalX],
    targetY: [literalY],
  };

  return [whenStarted, scanArea, moveTo, repeatLoop];
};

type WorkspaceProps = ComponentProps<typeof Workspace>;

const logDrop: WorkspaceProps['onDrop'] = (event, target) => {
  event.preventDefault();
  // eslint-disable-next-line no-console -- Storybook interaction logging helper
  console.log('drop', target);
};

const logTouchDrop: NonNullable<WorkspaceProps['onTouchDrop']> = (payload, target) => {
  // eslint-disable-next-line no-console -- Storybook interaction logging helper
  console.log('touch-drop', { payload, target });
};

const logUpdate: NonNullable<WorkspaceProps['onUpdateBlock']> = (instanceId) => {
  // eslint-disable-next-line no-console -- Storybook interaction logging helper
  console.log('update-block', instanceId);
};

const logRemove: WorkspaceProps['onRemoveBlock'] = (instanceId) => {
  // eslint-disable-next-line no-console -- Storybook interaction logging helper
  console.log('remove-block', instanceId);
};

const meta = {
  title: 'Programming Blocks/Workspace',
  component: Workspace,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  argTypes: {
    blocks: { control: false },
    onDrop: { control: false },
    onTouchDrop: { control: false },
    onUpdateBlock: { control: false },
    onRemoveBlock: { control: false },
    telemetry: { control: false },
  },
} satisfies Meta<typeof Workspace>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WorkspaceShowcase: Story = {
  args: {
    blocks: buildWorkspace(),
    onDrop: logDrop,
    onTouchDrop: logTouchDrop,
    onUpdateBlock: logUpdate,
    onRemoveBlock: logRemove,
  },
  render: (args: WorkspaceProps) => (
    <div
      style={{
        background: 'var(--color-background)',
        padding: '2rem',
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ maxWidth: '640px', width: '100%' }}>
        <Workspace {...args} />
      </div>
    </div>
  ),
};
