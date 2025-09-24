import type { Meta, StoryObj } from '@storybook/react';
import type { ModuleIconVariant } from '../simulation/robot/modules/moduleLibrary';
import ModuleIcon from './ModuleIcon';

const VARIANTS: ModuleIconVariant[] = ['movement', 'manipulation', 'inventory', 'crafting', 'scanning', 'status'];

const meta = {
  title: 'Components/ModuleIcon',
  component: ModuleIcon,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: {
        type: 'select',
      },
      options: VARIANTS,
    },
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ModuleIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Movement: Story = {
  args: {
    variant: 'movement',
  },
};

export const Manipulation: Story = {
  args: {
    variant: 'manipulation',
  },
};

export const Inventory: Story = {
  args: {
    variant: 'inventory',
  },
};

export const Crafting: Story = {
  args: {
    variant: 'crafting',
  },
};

export const Scanning: Story = {
  args: {
    variant: 'scanning',
  },
};

export const Status: Story = {
  args: {
    variant: 'status',
  },
};

export const Gallery: Story = {
  args: {
    variant: 'movement',
  },
  render: () => (
    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      {VARIANTS.map((variant) => (
        <div key={variant} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <ModuleIcon variant={variant} />
          <span style={{ textTransform: 'capitalize', fontSize: '0.85rem', letterSpacing: '0.04em' }}>{variant}</span>
        </div>
      ))}
    </div>
  ),
};
