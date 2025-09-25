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

const complexEntity: EntityOverlayData = {
  entityId: 202,
  name: 'Courier Drone',
  description: 'Multi-purpose hauler outfitted for autonomous resource ferry duties.',
  overlayType: 'complex',
  chassis: {
    capacity: 3,
    slots: [
      {
        id: 'core-0',
        index: 0,
        occupantId: 'core.movement',
        metadata: { stackable: false, moduleSubtype: undefined, locked: false },
      },
      {
        id: 'sensor-0',
        index: 1,
        occupantId: 'sensor.survey',
        metadata: { stackable: false, moduleSubtype: undefined, locked: false },
      },
      {
        id: 'utility-0',
        index: 2,
        occupantId: null,
        metadata: { stackable: false, moduleSubtype: undefined, locked: false },
      },
    ],
  },
  inventory: {
    capacity: 4,
    slots: [
      {
        id: 'cargo-0',
        index: 0,
        occupantId: 'resource.scrap',
        stackCount: 6,
        metadata: { stackable: true, moduleSubtype: undefined, locked: false },
      },
      {
        id: 'cargo-1',
        index: 1,
        occupantId: 'core.movement',
        metadata: { stackable: false, moduleSubtype: undefined, locked: false },
      },
      {
        id: 'cargo-2',
        index: 2,
        occupantId: null,
        metadata: { stackable: true, moduleSubtype: undefined, locked: false },
      },
      {
        id: 'cargo-3',
        index: 3,
        occupantId: null,
        metadata: { stackable: true, moduleSubtype: undefined, locked: false },
      },
    ],
  },
  programState: { isRunning: false, activeBlockId: null },
};

const OverlayPreview = ({ entity }: { entity: EntityOverlayData }): JSX.Element => {
  const { openOverlay, closeOverlay } = useEntityOverlayManager();

  useEffect(() => {
    openOverlay(entity, { initialTab: entity.overlayType === 'simple' ? 'info' : 'systems' });
  }, [entity, openOverlay]);

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
          <OverlayPreview entity={sampleEntity} />
        </EntityOverlayManagerProvider>
      </DragProvider>
    </div>
  ),
};

export const ComplexEntity: Story = {
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
          <OverlayPreview entity={complexEntity} />
        </EntityOverlayManagerProvider>
      </DragProvider>
    </div>
  ),
};
