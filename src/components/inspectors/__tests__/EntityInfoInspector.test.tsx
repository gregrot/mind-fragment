import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EntityInfoInspector from '../EntityInfoInspector';
import type { EntityOverlayData } from '../../../types/overlay';
import type { EntityId } from '../../../simulation/ecs/world';

const baseEntity: EntityOverlayData = {
  entityId: 101 as EntityId,
  name: 'Iridescent Node',
  description: 'A shimmering deposit discovered during the dawn survey.',
  overlayType: 'simple',
};

const renderInspector = (overrides: Partial<EntityOverlayData> = {}) =>
  render(<EntityInfoInspector entity={{ ...baseEntity, ...overrides }} onClose={() => {}} />);

afterEach(() => {
  cleanup();
});

describe('EntityInfoInspector', () => {
  it('shows the entity summary for simple overlays', () => {
    renderInspector();

    expect(screen.getByRole('heading', { name: baseEntity.name })).toBeInTheDocument();
    expect(screen.getByText(baseEntity.description!)).toBeInTheDocument();
  });

  it('renders formatted properties', () => {
    renderInspector({
      properties: {
        remainingYield: 128,
        isStable: true,
        resourceTypes: ['Iron', 'Nickel'],
        metadata: { hazard: 'Low' },
      },
    });

    expect(screen.getByText('Remaining Yield')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(screen.getByText('Is Stable')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Resource Types')).toBeInTheDocument();
    expect(screen.getByText('Iron, Nickel')).toBeInTheDocument();
    expect(screen.getByText('Metadata')).toBeInTheDocument();
    expect(screen.getByText('{"hazard":"Low"}')).toBeInTheDocument();
  });

  it('hides undefined properties and shows a placeholder when none remain', () => {
    renderInspector({ properties: { ignored: undefined } });

    expect(screen.getByText('No additional properties available.')).toBeInTheDocument();
  });

  it('switches to a neutral heading for complex overlays', () => {
    renderInspector({ overlayType: 'complex' });

    expect(screen.getByRole('heading', { name: 'Entity Information' })).toBeInTheDocument();
    expect(screen.getByText(baseEntity.name)).toBeInTheDocument();
    expect(screen.getByText('Key facts about this entity.')).toBeInTheDocument();
  });
});
