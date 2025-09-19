/**
 * Simplified drag-and-drop tests focusing on core functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import { StackEditor } from '../src/StackEditor';
import { StackRegistry, createDefaultRegistry } from '../src/StackRegistry';
import { StackProgram } from '../src/types';

// Helper function to create mock DataTransfer
function createMockDataTransfer() {
  return {
    data: {} as Record<string, string>,
    setData: function(format: string, data: string) { this.data[format] = data; },
    getData: function(format: string) { return this.data[format] || ''; },
    clearData: function() { this.data = {}; },
    dropEffect: 'copy' as const,
    effectAllowed: 'copy' as const
  };
}

describe('StackEditor Drag and Drop - Simplified', () => {
  let registry: StackRegistry;
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registry = createDefaultRegistry();
    mockOnChange = vi.fn();
  });

  it('should create new block when dragging from palette to empty program', () => {
    const { container } = render(
      <StackEditor 
        registry={registry} 
        program={{ blocks: [] }}
        onChange={mockOnChange}
      />
    );

    // Find the main drop zone (the one with different text)
    const dropZone = screen.getByText(/drop blocks here or click from palette/i);
    expect(dropZone).toBeTruthy();

    // Create drag data for palette block
    const dragData = {
      type: 'palette-block',
      spec: {
        kind: 'looks.say',
        label: 'say {}',
        form: 'statement',
        inputs: [{ key: 'TEXT', type: 'string' }]
      }
    };

    // Simulate drag and drop
    act(() => {
      const mockDataTransfer = createMockDataTransfer();
      mockDataTransfer.setData('application/json', JSON.stringify(dragData));

      // Simulate dragover first
      fireEvent.dragOver(dropZone, { dataTransfer: mockDataTransfer });

      // Then simulate drop
      fireEvent.drop(dropZone, { dataTransfer: mockDataTransfer });
    });

    // Verify onChange was called with new block
    expect(mockOnChange).toHaveBeenCalled();
    const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
    const newProgram = lastCall[0] as StackProgram;
    
    expect(newProgram.blocks).toHaveLength(1);
    expect(newProgram.blocks[0].kind).toBe('looks.say');
    expect(newProgram.blocks[0].form).toBe('statement');
    expect(newProgram.blocks[0].id).toBeTruthy();
  });

  it('should handle invalid drag data gracefully', () => {
    render(
      <StackEditor 
        registry={registry} 
        program={{ blocks: [] }}
        onChange={mockOnChange}
      />
    );

    const dropZone = screen.getByText(/drop blocks here or click from palette/i);

    // Try dropping with invalid JSON
    act(() => {
      const mockDataTransfer = createMockDataTransfer();
      mockDataTransfer.setData('application/json', 'invalid json');
      
      fireEvent.dragOver(dropZone, { dataTransfer: mockDataTransfer });
      fireEvent.drop(dropZone, { dataTransfer: mockDataTransfer });
    });

    // Should not crash and should not call onChange
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('should handle empty drag data gracefully', () => {
    render(
      <StackEditor 
        registry={registry} 
        program={{ blocks: [] }}
        onChange={mockOnChange}
      />
    );

    const dropZone = screen.getByText(/drop blocks here or click from palette/i);

    // Try dropping with no data
    act(() => {
      const mockDataTransfer = createMockDataTransfer();
      // Don't set any data
      
      fireEvent.dragOver(dropZone, { dataTransfer: mockDataTransfer });
      fireEvent.drop(dropZone, { dataTransfer: mockDataTransfer });
    });

    // Should not crash and should not call onChange
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('should work when onChange is not provided', () => {
    render(
      <StackEditor 
        registry={registry} 
        program={{ blocks: [] }}
        // No onChange prop
      />
    );

    const dropZone = screen.getByText(/drop blocks here or click from palette/i);

    const dragData = {
      type: 'palette-block',
      spec: {
        kind: 'looks.say',
        label: 'say {}',
        form: 'statement',
        inputs: [{ key: 'TEXT', type: 'string' }]
      }
    };

    // Should not crash when dropping without onChange
    expect(() => {
      act(() => {
        const mockDataTransfer = createMockDataTransfer();
        mockDataTransfer.setData('application/json', JSON.stringify(dragData));
        
        fireEvent.dragOver(dropZone, { dataTransfer: mockDataTransfer });
        fireEvent.drop(dropZone, { dataTransfer: mockDataTransfer });
      });
    }).not.toThrow();
  });
});