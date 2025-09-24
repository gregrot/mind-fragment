import type { Meta, StoryObj } from '@storybook/react';
import panelStyles from '../styles/RobotProgrammingPanel.module.css';

const meta = {
  title: 'UI Buttons/ProgrammingActions',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  render: () => (
    <div
      style={{
        background: 'var(--color-surface-glass-strong)',
        padding: '2rem',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-soft)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        minWidth: '320px',
        maxWidth: '420px',
      }}
    >
      <div className={panelStyles.actions} style={{ justifyContent: 'center' }}>
        <button type="button" className={`${panelStyles.primary}`}>Deploy routine</button>
        <button type="button" className={`${panelStyles.secondary}`}>Cancel</button>
      </div>
      <div className={panelStyles.actions} style={{ justifyContent: 'center' }}>
        <button type="button" className={`${panelStyles.primary}`} disabled>
          Deploy routine
        </button>
        <button type="button" className={`${panelStyles.secondary}`} disabled>
          Cancel
        </button>
      </div>
    </div>
  ),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ButtonStates: Story = {};
