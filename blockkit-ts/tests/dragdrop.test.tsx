/**
 * Tests for drag-and-drop functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { StackEditor } from '../src/StackEditor';
import { StackRegistry, createDefaultRegistry } from '../src/StackRegistry';
import { StackProgram, StackBlock } from '../src/types';

describe('StackEditor Drag and Drop', () => {
  let registry: StackRegistry;
  let mockOnChange: ReturnType<typeof vi.fn>;
  let initialProgram: StackProgram;

  beforeEach(() => {
    registry = createDefaultRegistry();
    mockOnChange = vi.fn();
    
    // Create a program with some existing blocks for testing movement
    initialProgram = {
      blocks: [
        {
          id: 'existing-say1',
          kind: 'looks.say',
          form: 'statement',
          inputs: {
            TEXT: { literal: 'Hello World' }
          }
        },
        {
          id: 'existing-repeat1',
          kind: 'control.repeat',
          form: 'c',
          inputs: {
            TIMES: { literal: 3 }
          },
          slots: {
            DO: [
              {
                id: 'nested-say1',
                kind: 'looks.say',
                form: 'statement',
                inputs: {
                  TEXT: { literal: 'Nested message' }
                }
              }
            ]
          }
        }
      ]
    };
  });

  describe('Block creation from palette drag operations', () => {
    it('should create new block when dragging from palette to main sequence', () => {
      const { container } = render(
        <StackEditor 
          registry={registry} 
          program={{ blocks: [] }}
          onChange={mockOnChange}
        />
      );

      // Find the main editor drop zone (the one with different styling)
      const dropZones = screen.getAllByText(/drop blocks here/i);
      const dropZone = dropZones.find(el => 
        el.style.color === 'rgb(153, 153, 153)' // Main editor has different color
      );
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

      // Simulate drag over and drop events with proper data transfer
      act(() => {
        // Simulate dragover first
        const dragOverEvent = new DragEvent('dragover', {
          dataTransfer: new DataTransfer(),
          bubbles: true
        });
        dragOverEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
        fireEvent(dropZone!, dragOverEvent);

        // Then simulate drop
        const dropEvent = new DragEvent('drop', {
          dataTransfer: dragOverEvent.dataTransfer,
          bubbles: true
        });
        fireEvent(dropZone!, dropEvent);
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

    it('should create new block when dragging from palette to C-block slot', () => {
      // Program with an empty repeat block
      const programWithEmptyRepeat: StackProgram = {
        blocks: [
          {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            inputs: {
              TIMES: { literal: 2 }
            },
            slots: {
              DO: []
            }
          }
        ]
      };

      render(
        <StackEditor 
          registry={registry} 
          program={programWithEmptyRepeat}
          onChange={mockOnChange}
        />
      );

      // Find palette block
      const paletteBlocks = screen.getAllByText(/think/i);
      const paletteBlock = paletteBlocks.find(el => 
        el.closest('[draggable="true"]') && 
        !el.closest('[data-testid]')
      );
      
      expect(paletteBlock).toBeTruthy();

      // Find the C-block slot drop zone (the nested one)
      const dropZones = screen.getAllByText(/drop blocks here/i);
      const slotDropZone = dropZones.find(el => 
        el.style.color === 'rgba(255, 255, 255, 0.7)' // C-block slots have different color
      );
      expect(slotDropZone).toBeTruthy();

      // Create drag data for palette block
      const dragData = {
        type: 'palette-block',
        spec: {
          kind: 'looks.think',
          label: 'think {}',
          form: 'statement',
          inputs: [{ key: 'TEXT', type: 'string' }]
        }
      };

      // Simulate drag and drop
      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      
      fireEvent(paletteBlock!, dragStartEvent);

      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      fireEvent(slotDropZone, dropEvent);

      // Verify onChange was called and block was added to slot
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      const newProgram = lastCall[0] as StackProgram;
      
      expect(newProgram.blocks[0].slots?.DO).toHaveLength(1);
      expect(newProgram.blocks[0].slots?.DO[0].kind).toBe('looks.think');
    });

    it('should create multiple blocks from repeated palette drags', () => {
      render(
        <StackEditor 
          registry={registry} 
          program={{ blocks: [] }}
          onChange={mockOnChange}
        />
      );

      const dropZones = screen.getAllByText(/drop blocks here/i);
      const dropZone = dropZones.find(el => 
        el.style.color === 'rgb(153, 153, 153)' // Main editor drop zone
      );

      // Drag first block
      const saySpec = {
        kind: 'looks.say',
        label: 'say {}',
        form: 'statement',
        inputs: [{ key: 'TEXT', type: 'string' }]
      };

      const dragData1 = {
        type: 'palette-block',
        spec: saySpec
      };

      const dragEvent1 = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
      dragEvent1.dataTransfer!.setData('application/json', JSON.stringify(dragData1));
      
      const dropEvent1 = new DragEvent('drop', { dataTransfer: dragEvent1.dataTransfer });
      fireEvent(dropZone, dropEvent1);

      // Drag second block
      const thinkSpec = {
        kind: 'looks.think',
        label: 'think {}',
        form: 'statement',
        inputs: [{ key: 'TEXT', type: 'string' }]
      };

      const dragData2 = {
        type: 'palette-block',
        spec: thinkSpec
      };

      const dragEvent2 = new DragEvent('dragstart', { dataTransfer: new DataTransfer() });
      dragEvent2.dataTransfer!.setData('application/json', JSON.stringify(dragData2));
      
      const dropEvent2 = new DragEvent('drop', { dataTransfer: dragEvent2.dataTransfer });
      fireEvent(dropZone, dropEvent2);

      // Verify both blocks were added
      expect(mockOnChange).toHaveBeenCalledTimes(2);
      const lastCall = mockOnChange.mock.calls[1];
      const finalProgram = lastCall[0] as StackProgram;
      
      expect(finalProgram.blocks).toHaveLength(2);
      expect(finalProgram.blocks[0].kind).toBe('looks.say');
      expect(finalProgram.blocks[1].kind).toBe('looks.think');
    });
  });

  describe('Block movement within and between sequences', () => {
    it('should move block within the same main sequence', () => {
      render(
        <StackEditor 
          registry={registry} 
          program={initialProgram}
          onChange={mockOnChange}
        />
      );

      // Find the first block (say block)
      const sayBlock = screen.getByDisplayValue('Hello World').closest('[draggable="true"]');
      expect(sayBlock).toBeTruthy();

      // Find the main sequence container by looking for the main editor area
      const mainSequence = sayBlock!.closest('div').parentElement;
      expect(mainSequence).toBeTruthy();

      // Create drag data for existing block movement
      const dragData = {
        type: 'existing-block',
        blockId: 'existing-say1',
        block: initialProgram.blocks[0]
      };

      // Simulate drag start
      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      
      fireEvent(sayBlock!, dragStartEvent);

      // Simulate drop at the end of sequence (after repeat block)
      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      fireEvent(mainSequence!, dropEvent);

      // Verify the block was moved
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      const newProgram = lastCall[0] as StackProgram;
      
      // The say block should now be after the repeat block
      expect(newProgram.blocks).toHaveLength(2);
      expect(newProgram.blocks[0].kind).toBe('control.repeat');
      expect(newProgram.blocks[1].kind).toBe('looks.say');
    });

    it('should move block from main sequence to C-block slot', () => {
      render(
        <StackEditor 
          registry={registry} 
          program={initialProgram}
          onChange={mockOnChange}
        />
      );

      // Find the say block in main sequence
      const sayBlock = screen.getByDisplayValue('Hello World').closest('[draggable="true"]');
      expect(sayBlock).toBeTruthy();

      // Find the C-block slot area by looking for the nested input's container
      const nestedInput = screen.getByDisplayValue('Nested message');
      const slotArea = nestedInput.closest('div').parentElement;
      expect(slotArea).toBeTruthy();

      // Create drag data for moving existing block
      const dragData = {
        type: 'existing-block',
        blockId: 'existing-say1',
        block: initialProgram.blocks[0]
      };

      // Simulate drag and drop
      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      
      fireEvent(sayBlock!, dragStartEvent);

      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      fireEvent(slotArea!, dropEvent);

      // Verify the block was moved to the slot
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      const newProgram = lastCall[0] as StackProgram;
      
      // Main sequence should only have the repeat block
      expect(newProgram.blocks).toHaveLength(1);
      expect(newProgram.blocks[0].kind).toBe('control.repeat');
      
      // The repeat block's slot should now have 2 blocks
      expect(newProgram.blocks[0].slots?.DO).toHaveLength(2);
      expect(newProgram.blocks[0].slots?.DO[1].kind).toBe('looks.say');
    });

    it('should move block from C-block slot to main sequence', () => {
      render(
        <StackEditor 
          registry={registry} 
          program={initialProgram}
          onChange={mockOnChange}
        />
      );

      // Find the nested block in the C-block slot
      const nestedBlock = screen.getByDisplayValue('Nested message').closest('[draggable="true"]');
      expect(nestedBlock).toBeTruthy();

      // Find the main sequence area
      const helloWorldInput = screen.getByDisplayValue('Hello World');
      const mainSequence = helloWorldInput.closest('div').parentElement;
      expect(mainSequence).toBeTruthy();

      // Create drag data for moving the nested block
      const dragData = {
        type: 'existing-block',
        blockId: 'nested-say1',
        block: initialProgram.blocks[1].slots!.DO[0]
      };

      // Simulate drag and drop
      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      
      fireEvent(nestedBlock!, dragStartEvent);

      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      fireEvent(mainSequence!, dropEvent);

      // Verify the block was moved to main sequence
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      const newProgram = lastCall[0] as StackProgram;
      
      // Main sequence should now have 3 blocks
      expect(newProgram.blocks).toHaveLength(3);
      expect(newProgram.blocks[2].kind).toBe('looks.say');
      expect(newProgram.blocks[2].inputs?.TEXT).toEqual({ literal: 'Nested message' });
      
      // The repeat block's slot should now be empty
      expect(newProgram.blocks[1].slots?.DO).toHaveLength(0);
    });

    it('should move block between different C-block slots', () => {
      // Create a program with two C-blocks
      const programWithTwoCBlocks: StackProgram = {
        blocks: [
          {
            id: 'repeat1',
            kind: 'control.repeat',
            form: 'c',
            inputs: { TIMES: { literal: 2 } },
            slots: {
              DO: [
                {
                  id: 'say-in-repeat',
                  kind: 'looks.say',
                  form: 'statement',
                  inputs: { TEXT: { literal: 'In repeat' } }
                }
              ]
            }
          },
          {
            id: 'if1',
            kind: 'control.if_else',
            form: 'c',
            inputs: { CONDITION: { literal: true } },
            slots: {
              THEN: [],
              ELSE: []
            }
          }
        ]
      };

      render(
        <StackEditor 
          registry={registry} 
          program={programWithTwoCBlocks}
          onChange={mockOnChange}
        />
      );

      // Find the block in the repeat slot
      const blockInRepeat = screen.getByDisplayValue('In repeat').closest('[draggable="true"]');
      expect(blockInRepeat).toBeTruthy();

      // Find the THEN slot of the if block (should be empty and show drop message)
      const thenSlots = screen.getAllByText(/drop blocks here/i);
      expect(thenSlots.length).toBeGreaterThan(0);
      const thenSlot = thenSlots.find(el => 
        el.style.color === 'rgba(255, 255, 255, 0.7)' // C-block slot color
      );

      // Create drag data
      const dragData = {
        type: 'existing-block',
        blockId: 'say-in-repeat',
        block: programWithTwoCBlocks.blocks[0].slots!.DO[0]
      };

      // Simulate drag and drop
      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      
      fireEvent(blockInRepeat!, dragStartEvent);

      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      fireEvent(thenSlot, dropEvent);

      // Verify the block was moved between slots
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      const newProgram = lastCall[0] as StackProgram;
      
      // Repeat slot should be empty
      expect(newProgram.blocks[0].slots?.DO).toHaveLength(0);
      
      // If THEN slot should have the block
      expect(newProgram.blocks[1].slots?.THEN).toHaveLength(1);
      expect(newProgram.blocks[1].slots?.THEN[0].kind).toBe('looks.say');
    });
  });

  describe('Verify no artificial movement restrictions exist', () => {
    it('should allow any block type to be moved to any sequence position', () => {
      // Create a program with different block types
      const mixedProgram: StackProgram = {
        blocks: [
          {
            id: 'hat1',
            kind: 'event.start',
            form: 'hat'
          },
          {
            id: 'statement1',
            kind: 'looks.say',
            form: 'statement',
            inputs: { TEXT: { literal: 'Statement' } }
          },
          {
            id: 'cblock1',
            kind: 'control.repeat',
            form: 'c',
            inputs: { TIMES: { literal: 1 } },
            slots: { DO: [] }
          }
        ]
      };

      render(
        <StackEditor 
          registry={registry} 
          program={mixedProgram}
          onChange={mockOnChange}
        />
      );

      // Try moving the hat block to the end (find the one in the main editor, not palette)
      const hatBlocks = screen.getAllByText('when green flag clicked');
      const hatBlock = hatBlocks.find(el => {
        const draggableParent = el.closest('[draggable="true"]');
        return draggableParent && draggableParent.style.cursor === 'grab';
      })?.closest('[draggable="true"]');
      expect(hatBlock).toBeTruthy();

      const mainSequence = hatBlock!.closest('div').parentElement;
      expect(mainSequence).toBeTruthy();

      const dragData = {
        type: 'existing-block',
        blockId: 'hat1',
        block: mixedProgram.blocks[0]
      };

      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      
      fireEvent(hatBlock!, dragStartEvent);

      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      fireEvent(mainSequence!, dropEvent);

      // Verify the hat block was moved (no restrictions)
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      const newProgram = lastCall[0] as StackProgram;
      
      // Hat block should now be at the end
      expect(newProgram.blocks[2].kind).toBe('event.start');
      expect(newProgram.blocks[2].form).toBe('hat');
    });

    it('should allow C-blocks to be nested inside other C-blocks', () => {
      const programWithNestedCBlocks: StackProgram = {
        blocks: [
          {
            id: 'outer-repeat',
            kind: 'control.repeat',
            form: 'c',
            inputs: { TIMES: { literal: 2 } },
            slots: { DO: [] }
          },
          {
            id: 'inner-repeat',
            kind: 'control.repeat',
            form: 'c',
            inputs: { TIMES: { literal: 3 } },
            slots: { DO: [] }
          }
        ]
      };

      render(
        <StackEditor 
          registry={registry} 
          program={programWithNestedCBlocks}
          onChange={mockOnChange}
        />
      );

      // Find the inner repeat block
      const innerRepeat = screen.getAllByText(/repeat/i)[1].closest('[draggable="true"]');
      expect(innerRepeat).toBeTruthy();

      // Find the outer repeat's slot
      const outerSlots = screen.getAllByText(/drop blocks here/i);
      const outerSlot = outerSlots.find(el => 
        el.style.color === 'rgba(255, 255, 255, 0.7)' // C-block slot color
      );
      expect(outerSlot).toBeTruthy();

      const dragData = {
        type: 'existing-block',
        blockId: 'inner-repeat',
        block: programWithNestedCBlocks.blocks[1]
      };

      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      
      fireEvent(innerRepeat!, dragStartEvent);

      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      fireEvent(outerSlot, dropEvent);

      // Verify C-block nesting is allowed
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      const newProgram = lastCall[0] as StackProgram;
      
      // Main sequence should only have outer repeat
      expect(newProgram.blocks).toHaveLength(1);
      expect(newProgram.blocks[0].kind).toBe('control.repeat');
      
      // Outer repeat should contain inner repeat
      expect(newProgram.blocks[0].slots?.DO).toHaveLength(1);
      expect(newProgram.blocks[0].slots?.DO[0].kind).toBe('control.repeat');
      expect(newProgram.blocks[0].slots?.DO[0].form).toBe('c');
    });

    it('should allow reporter blocks to be moved freely like other blocks', () => {
      // Register a reporter block for testing
      registry.register({
        kind: 'test.reporter',
        label: 'test value',
        form: 'reporter'
      });

      const programWithReporter: StackProgram = {
        blocks: [
          {
            id: 'reporter1',
            kind: 'test.reporter',
            form: 'reporter'
          },
          {
            id: 'say1',
            kind: 'looks.say',
            form: 'statement',
            inputs: { TEXT: { literal: 'Hello' } }
          }
        ]
      };

      render(
        <StackEditor 
          registry={registry} 
          program={programWithReporter}
          onChange={mockOnChange}
        />
      );

      // Find the reporter block (the draggable one, not the palette one)
      const reporterBlocks = screen.getAllByText(/test value/i);
      const reporterBlock = reporterBlocks.find(el => 
        el.closest('[draggable="true"]') && 
        el.style.cursor === 'grab' // This should be the draggable one in the main area
      )?.closest('[draggable="true"]');
      expect(reporterBlock).toBeTruthy();

      const mainSequence = reporterBlock!.closest('div').parentElement;
      expect(mainSequence).toBeTruthy();

      const dragData = {
        type: 'existing-block',
        blockId: 'reporter1',
        block: programWithReporter.blocks[0]
      };

      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      
      fireEvent(reporterBlock!, dragStartEvent);

      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      fireEvent(mainSequence!, dropEvent);

      // Verify reporter block can be moved freely
      expect(mockOnChange).toHaveBeenCalled();
      const lastCall = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1];
      const newProgram = lastCall[0] as StackProgram;
      
      // Reporter should be moved to end
      expect(newProgram.blocks[1].kind).toBe('test.reporter');
      expect(newProgram.blocks[1].form).toBe('reporter');
    });

    it('should handle rapid successive drag operations without restrictions', () => {
      render(
        <StackEditor 
          registry={registry} 
          program={initialProgram}
          onChange={mockOnChange}
        />
      );

      const helloWorldInput = screen.getByDisplayValue('Hello World');
      const mainSequence = helloWorldInput.closest('div').parentElement;
      expect(mainSequence).toBeTruthy();

      // Perform multiple rapid drag operations
      for (let i = 0; i < 3; i++) {
        const dragData = {
          type: 'palette-block',
          spec: {
            kind: 'looks.think',
            label: 'think {}',
            form: 'statement',
            inputs: [{ key: 'TEXT', type: 'string' }]
          }
        };

        const dragStartEvent = new DragEvent('dragstart', {
          dataTransfer: new DataTransfer()
        });
        dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));

        const dropEvent = new DragEvent('drop', {
          dataTransfer: dragStartEvent.dataTransfer
        });
        
        fireEvent(mainSequence!, dropEvent);
      }

      // Verify all operations succeeded
      expect(mockOnChange).toHaveBeenCalledTimes(3);
      const lastCall = mockOnChange.mock.calls[2];
      const finalProgram = lastCall[0] as StackProgram;
      
      // Should have original 2 blocks + 3 new blocks
      expect(finalProgram.blocks).toHaveLength(5);
      
      // Last 3 blocks should be the newly added think blocks
      expect(finalProgram.blocks[2].kind).toBe('looks.think');
      expect(finalProgram.blocks[3].kind).toBe('looks.think');
      expect(finalProgram.blocks[4].kind).toBe('looks.think');
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle invalid drag data gracefully', () => {
      render(
        <StackEditor 
          registry={registry} 
          program={{ blocks: [] }}
          onChange={mockOnChange}
        />
      );

      const dropZones = screen.getAllByText(/drop blocks here/i);
      const dropZone = dropZones.find(el => 
        el.style.color === 'rgb(153, 153, 153)' // Main editor drop zone
      );

      // Try dropping with invalid JSON
      const invalidDragEvent = new DragEvent('drop', {
        dataTransfer: new DataTransfer()
      });
      invalidDragEvent.dataTransfer!.setData('application/json', 'invalid json');
      
      fireEvent(dropZone, invalidDragEvent);

      // Should not crash or call onChange
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

      const dropZones = screen.getAllByText(/drop blocks here/i);
      const dropZone = dropZones.find(el => 
        el.style.color === 'rgb(153, 153, 153)' // Main editor drop zone
      );

      // Try dropping with no data
      const emptyDragEvent = new DragEvent('drop', {
        dataTransfer: new DataTransfer()
      });
      
      fireEvent(dropZone, emptyDragEvent);

      // Should not crash or call onChange
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it('should handle drag operations when onChange is not provided', () => {
      render(
        <StackEditor 
          registry={registry} 
          program={{ blocks: [] }}
        />
      );

      const dropZones = screen.getAllByText(/drop blocks here/i);
      const dropZone = dropZones.find(el => 
        el.style.color === 'rgb(153, 153, 153)' // Main editor drop zone
      );

      const dragData = {
        type: 'palette-block',
        spec: {
          kind: 'looks.say',
          label: 'say {}',
          form: 'statement',
          inputs: [{ key: 'TEXT', type: 'string' }]
        }
      };

      const dragStartEvent = new DragEvent('dragstart', {
        dataTransfer: new DataTransfer()
      });
      dragStartEvent.dataTransfer!.setData('application/json', JSON.stringify(dragData));

      const dropEvent = new DragEvent('drop', {
        dataTransfer: dragStartEvent.dataTransfer
      });
      
      // Should not crash even without onChange callback
      expect(() => fireEvent(dropZone, dropEvent)).not.toThrow();
    });
  });
});