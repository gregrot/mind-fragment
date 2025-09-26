import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EntityOverlay from '../EntityOverlay';
import {
  EntityOverlayManagerProvider,
  useEntityOverlayManager,
} from '../../state/EntityOverlayManager';
import { useEffect } from 'react';
import type { EntityOverlayData } from '../../types/overlay';
import type { EntityId } from '../../simulation/ecs/world';
import { registerInspector } from '../../overlay/inspectorRegistry';
import EntityInfoInspector from '../inspectors/EntityInfoInspector';
import { DragProvider } from '../../state/DragContext';
import type { OverlayPersistenceAdapter } from '../../state/overlayPersistence';

const createOverlayData = (): EntityOverlayData => ({
  entityId: 5 as EntityId,
  name: 'Test Entity',
  description: 'Inspection overlay for testing',
  overlayType: 'complex',
});

const createSimpleOverlayData = (): EntityOverlayData => ({
  entityId: 6 as EntityId,
  name: 'Ore Vein',
  description: 'High-yield ferrous deposit',
  overlayType: 'simple',
  properties: {
    yield: 320,
    composition: ['Iron', 'Nickel'],
  },
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

let managerApi: ReturnType<typeof useEntityOverlayManager> | null = null;

const ManagerCapture = (): null => {
  managerApi = useEntityOverlayManager();
  return null;
};

const renderOverlay = (onClose: () => void, adapter?: OverlayPersistenceAdapter) =>
  render(
    <EntityOverlayManagerProvider persistenceAdapter={adapter}>
      <DragProvider>
        <ManagerCapture />
        <OverlayHarness onClose={onClose} />
      </DragProvider>
    </EntityOverlayManagerProvider>,
  );

afterEach(() => {
  cleanup();
  managerApi = null;
});

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
    fireEvent.keyDown(systemsTab, { key: 'ArrowRight' });

    const [programmingTab] = await screen.findAllByRole('tab', { name: 'Programming' });
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

  it('renders the simple entity info bubble when an info inspector is registered', async () => {
    try {
      registerInspector({
        id: 'test-entity-info',
        label: 'Overview',
        group: 'info',
        component: EntityInfoInspector,
      });
    } catch (error) {
      if (!(error instanceof Error) || !/already registered/i.test(error.message)) {
        throw error;
      }
    }

    const simpleData = createSimpleOverlayData();

    const SimpleOverlayHarness = ({ onClose }: { onClose: () => void }): JSX.Element => {
      const manager = useEntityOverlayManager();

      useEffect(() => {
        if (!manager.isOpen) {
          manager.openOverlay(simpleData);
        }
      }, [manager]);

      return <EntityOverlay onClose={onClose} />;
    };

    render(
      <EntityOverlayManagerProvider>
        <DragProvider>
          <SimpleOverlayHarness onClose={vi.fn()} />
        </DragProvider>
      </EntityOverlayManagerProvider>,
    );

    await screen.findByTestId('entity-info-inspector');
    expect(screen.getByText('Yield')).toBeInTheDocument();
    expect(screen.getByText('320')).toBeInTheDocument();
    expect(screen.getByText('Composition')).toBeInTheDocument();
    expect(screen.getByText('Iron, Nickel')).toBeInTheDocument();
  });

  it('surfaces persistence failures with retry controls scoped to the active entity', async () => {
    const attempts: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
    const adapter: OverlayPersistenceAdapter = {
      saveEntity: vi.fn(
        () =>
          new Promise<void>((resolve, reject) => {
            attempts.push({ resolve, reject });
          }),
      ),
      removeEntity: vi.fn(async () => {}),
    };

    renderOverlay(vi.fn(), adapter);

    await screen.findByTestId('entity-overlay');
    expect(managerApi).not.toBeNull();

    await act(async () => {
      managerApi?.upsertEntityData({ ...createOverlayData(), description: 'Updated description' });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(adapter.saveEntity).toHaveBeenCalledTimes(1);
    });

    await screen.findByText('Saving changes…');

    const failure = new Error('save failed');
    await act(async () => {
      const attempt = attempts.shift();
      expect(attempt).toBeDefined();
      attempt?.reject(failure);
      await Promise.resolve();
    });

    const banner = await screen.findByTestId('entity-overlay-persistence-error');
    expect(banner).toHaveTextContent('Changes could not be saved.');
    expect(banner).toHaveTextContent('save failed');

    const retryButton = screen.getByRole('button', { name: 'Retry save' });
    await act(async () => {
      fireEvent.click(retryButton);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(adapter.saveEntity).toHaveBeenCalledTimes(2);
    });

    await screen.findByText('Saving changes…');

    await act(async () => {
      const retryAttempt = attempts.shift();
      expect(retryAttempt).toBeDefined();
      retryAttempt?.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByTestId('entity-overlay-persistence-error')).toBeNull();
      expect(screen.queryByText('Saving changes…')).toBeNull();
    });
  });
});
