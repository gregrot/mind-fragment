# Implementation Plan

- [✅] 1. Create core overlay infrastructure and data models
  - Implement EntityOverlayManager context and provider
  - Create base Inspector interface and registration system
  - Define unified SlotSchema and EntityOverlayData types
  - Write unit tests for overlay state management
  - _Requirements: 1.1, 1.5, 6.1, 6.2_

- [✅] 2. Implement entity selection and overlay lifecycle
  - Add entity click handlers to ECS systems
  - Create EntityOverlay modal component with tab navigation
  - Implement overlay opening/closing with focus management
  - Add keyboard navigation and escape key handling
  - Write tests for overlay lifecycle and accessibility
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [✅] 3. Create simple entity info bubble system
  - Implement EntityInfoInspector component
  - Add simple entity detection logic
  - Create info bubble layout and styling
  - Integrate with overlay framework for simple entities
  - Write tests for simple entity display
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [✅] 4. Build drag-and-drop infrastructure
  - Create DragContext and DropTarget interfaces
  - Implement drag preview system with live thumbnails
  - Add drop validation and snap-to-grid logic
  - Create drag state management and event handlers
  - Write tests for drag-and-drop core functionality
  - _Requirements: 6.5, 6.6, 6.7, 6.8_

- [ ] 5. Implement ChassisInspector component
  - Create chassis slot rendering with module thumbnails
  - Add module tooltip display on hover
  - Implement chassis-specific drag-and-drop handlers
  - Add module swapping and movement logic
  - Write tests for chassis inspector functionality
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ] 6. Extend RobotChassis with slot schema support
  - Add slot-based access methods to ModuleStack
  - Implement slot schema conversion utilities
  - Add module attachment/detachment event handling
  - Create chassis state synchronization with overlay
  - Write tests for chassis data integration
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 7. Implement InventoryInspector component
  - Create inventory slot rendering with item display
  - Add stack count visualization and management
  - Implement inventory-specific drag-and-drop handlers
  - Add item reordering and swapping logic
  - Write tests for inventory inspector functionality
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [ ] 8. Extend InventoryStore with slot schema support
  - Add slot-based inventory access methods
  - Implement item stacking and splitting logic
  - Add inventory change event emission
  - Create inventory state synchronization with overlay
  - Write tests for inventory data integration
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 9. Implement cross-inspector drag operations
  - Add chassis-to-inventory drag handling
  - Add inventory-to-chassis drag handling
  - Implement module equipping from inventory
  - Add validation for cross-inspector drops
  - Write tests for cross-inspector drag scenarios
  - _Requirements: 2.5, 2.6, 3.8, 3.9_

- [ ] 10. Create ProgramInspector integration
  - Adapt existing RobotProgrammingPanel for inspector framework
  - Add execution state awareness and read-only mode
  - Implement program lock state messaging and controls
  - Add chassis change detection for module warnings
  - Write tests for programming inspector integration
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 11. Implement immediate persistence system
  - Add automatic save triggers for all overlay changes
  - Create change event emission for system synchronization
  - Implement optimistic updates with error handling
  - Add persistence failure recovery mechanisms
  - Write tests for persistence and synchronization
  - _Requirements: 6.3, 6.4_

- [ ] 12. Add overlay styling and visual polish
  - Create CSS modules for all overlay components
  - Implement responsive layout for different screen sizes
  - Add loading states and skeleton UI components
  - Create smooth animations for drag operations
  - Write visual regression tests for overlay appearance
  - _Requirements: 1.1, 2.3, 3.6_

- [ ] 13. Integrate overlay system with existing SimulationOverlay
  - Replace current overlay with new EntityOverlay system
  - Migrate existing tab functionality to inspector framework
  - Update entity selection handlers in simulation components
  - Ensure backward compatibility with existing features
  - Write integration tests for overlay replacement
  - _Requirements: 1.1, 4.1, 5.4_

- [ ] 14. Add comprehensive error handling and user feedback
  - Implement error boundaries for overlay components
  - Add user-friendly error messages for failed operations
  - Create retry mechanisms for network failures
  - Add validation feedback for invalid drag operations
  - Write tests for error scenarios and recovery
  - _Requirements: 6.8_

- [ ] 15. Optimize performance and add accessibility features
  - Implement virtualization for large inventories
  - Add keyboard navigation for all interactive elements
  - Create screen reader support with proper ARIA labels
  - Optimize drag preview rendering performance
  - Write performance and accessibility tests
  - _Requirements: 1.1, 1.5_