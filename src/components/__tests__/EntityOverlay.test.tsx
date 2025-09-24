import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EntityOverlay from '../EntityOverlay';
import {
  EntityOverlayManagerProvider,
  useEntityOverlayManager,
} from '../../state/EntityOverlayManager';
import { useEffect } from 'react';
import type { EntityOverlayData } from '../../types/overlay';
import type { EntityId } from '../../simulation/ecs/world';

const createOverlayData = (): EntityOverlayData => ({
  entityId: 5 as EntityId,
  name: 'Test Entity',
  description: 'Inspection overlay for testing',
  overlayType: 'complex',
});

const OverlayHarness = ({ onClose }: { onClose: () => void }): JSX.Element => {
  const manager = useEntityOverlayManager();

  useEffect(() => {
    if (!manager.isOpen) {
      manager.openOverlay(createOverlayData());
    }
  }, [manager]);

  return <EntityOverlay onClose={onClose} />;
};

const renderOverlay = (onClose: () => void) =>
  render(
    <EntityOverlayManagerProvider>
      <OverlayHarness onClose={onClose} />
    </EntityOverlayManagerProvider>,
  );

describe('EntityOverlay', () => {
  it('renders the entity name and defaults to the systems tab', async () => {
    renderOverlay(vi.fn());

    await screen.findAllByText('Test Entity');
    const [systemsTab] = await screen.findAllByRole('tab', { name: 'Systems' });
    expect(systemsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('supports keyboard navigation between tabs', async () => {
    renderOverlay(vi.fn());

    const [systemsTab] = await screen.findAllByRole('tab', { name: 'Systems' });
    systemsTab.focus();
    await userEvent.keyboard('{ArrowRight}');

    const [programmingTab] = await screen.findAllByRole('tab', { name: 'Programming' });
    await screen.findAllByRole('tab', { name: 'Programming' });
    await waitFor(() => {
      expect(programmingTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('invokes the close handler when Escape is pressed', async () => {
    const handleClose = vi.fn();
    renderOverlay(handleClose);

    await screen.findAllByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(handleClose).toHaveBeenCalled();
  });
});
