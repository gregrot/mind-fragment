import type { Meta, StoryObj } from '@storybook/react';
import ModuleInventory from '../components/ModuleInventory';

const meta = {
  title: 'UI Panels/ModuleInventory',
  component: ModuleInventory,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ModuleInventory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CatalogueOverview: Story = {
  render: () => (
    <div
      style={{
        background: 'var(--color-background-muted)',
        padding: '2rem',
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: '960px', width: '100%' }}>
        <ModuleInventory />
      </div>
    </div>
  ),
};
