import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import EntityOverlay from '../components/EntityOverlay';
import { EntityOverlayManagerProvider, useEntityOverlayManager } from '../state/EntityOverlayManager';
import { DragProvider } from '../state/DragContext';
import { ensureDefaultInspectorsRegistered } from '../overlay/defaultInspectors';
import type { EntityOverlayData } from '../types/overlay';

ensureDefaultInspectorsRegistered();

const sampleEntity: EntityOverlayData = {
  entityId: 101,
  name: 'Sentry Drone',
  description:
    'Autonomous perimeter drone equipped with a short-range survey scanner and limited cargo capacity.',
  overlayType: 'simple',
  properties: {
    chassis: 'Scout Mk II',
    status: 'Idle',
    batteryLevel: '78%',
    lastCommand: 'Hold Position',
  },
};

const OverlayPreview = (): JSX.Element => {
  const { openOverlay, closeOverlay } = useEntityOverlayManager();

  useEffect(() => {
    openOverlay(sampleEntity, { initialTab: 'info' });
  }, [openOverlay]);

  return <EntityOverlay onClose={closeOverlay} />;
};

const meta = {
  title: 'Overlay Windows/EntityOverlay',
  component: EntityOverlay,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof EntityOverlay>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SimpleEntity: Story = {
  render: () => (
    <div
      style={{
        background: 'var(--color-background)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        boxSizing: 'border-box',
      }}
    >
      <DragProvider>
        <EntityOverlayManagerProvider>
          <OverlayPreview />
        </EntityOverlayManagerProvider>
      </DragProvider>
    </div>
  ),
};
