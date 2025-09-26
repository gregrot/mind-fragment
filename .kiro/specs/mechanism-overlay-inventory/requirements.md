# Requirements Document

## Introduction

This feature implements a comprehensive mechanism overlay system that provides players with an intuitive interface for managing mechanism chassis, inventory, and programming. The overlay appears when clicking on entities and provides tabbed access to different aspects of mechanism management including module installation, inventory management, and block programming. The system emphasizes immediate persistence, drag-and-drop interactions, and a unified inspector framework that can be extended to other entity types.

## Requirements

### Requirement 1

**User Story:** As a player, I want to click on any entity to open its overlay, so that I can inspect and interact with that entity's properties and capabilities.

#### Acceptance Criteria

1. WHEN a player clicks on any entity THEN the system SHALL display an appropriate overlay for that entity
2. WHEN the entity is simple (resource nodes, loose objects) THEN the system SHALL display a compact info bubble
3. WHEN the entity is complex (mechanisms) THEN the system SHALL display a full tabbed overlay
4. WHEN the player clicks outside the overlay OR presses Escape THEN the system SHALL close the overlay automatically
5. WHEN the player clicks on the same entity repeatedly THEN the system SHALL retain focus state and refresh content in place rather than recreating the overlay

### Requirement 2

**User Story:** As a player, I want to manage my mechanism's chassis configuration through a dedicated inspector, so that I can equip and swap modules to customize my mechanism's capabilities.

#### Acceptance Criteria

1. WHEN viewing a mechanism overlay THEN the system SHALL provide a Systems tab containing a ChassisInspector
2. WHEN displaying the chassis inspector THEN the system SHALL show 3 generic module slots by default
3. WHEN a chassis slot is occupied THEN the system SHALL display the module's live thumbnail and name
4. WHEN hovering over an occupied slot THEN the system SHALL show a tooltip with module stats and effects
5. WHEN dragging a module from chassis to inventory THEN the system SHALL move the module successfully
6. WHEN dropping a module on an occupied chassis slot THEN the system SHALL swap the two modules
7. WHEN dropping a module outside any valid slot THEN the system SHALL snap the module back to its origin
8. WHEN all slots accept any module category THEN the system SHALL allow any module to be placed in any slot

### Requirement 3

**User Story:** As a player, I want to manage my mechanism's inventory through a dedicated inspector, so that I can organize items and modules for use during missions.

#### Acceptance Criteria

1. WHEN viewing a mechanism overlay THEN the system SHALL provide an InventoryInspector in the Systems tab
2. WHEN displaying the inventory inspector THEN the system SHALL show 10 slots by default
3. WHEN the inventory accepts any game object THEN the system SHALL allow modules and items to be stored
4. WHEN items share the same identifier and support stacking THEN the system SHALL stack them automatically
5. WHEN objects opt out of stacking THEN the system SHALL occupy one slot per item
6. WHEN items are stacked THEN the system SHALL display stack counts
7. WHEN dragging items within inventory THEN the system SHALL support reordering with snap-to-slot placement
8. WHEN dragging an item onto an occupied inventory slot THEN the system SHALL swap items or merge compatible stacks
9. WHEN dragging a module from inventory to chassis THEN the system SHALL equip the module following chassis swapping rules

### Requirement 4

**User Story:** As a player, I want to program my mechanism through the overlay interface, so that I can define behaviors while viewing the mechanism's current configuration.

#### Acceptance Criteria

1. WHEN viewing a mechanism overlay THEN the system SHALL provide a Programming tab containing a ProgramInspector
2. WHEN a program is running THEN the system SHALL make the inspector read-only and highlight the currently executing block
3. WHEN a program is running AND the player wants to edit THEN the system SHALL provide explicit messaging about the lock state and offer stop controls
4. WHEN execution stops THEN the system SHALL unlock editing immediately
5. WHEN making program changes THEN the system SHALL persist changes immediately to the mechanism's program store
6. WHEN chassis changes occur THEN the system SHALL update blocks that depend on missing modules to show warnings

### Requirement 5

**User Story:** As a player, I want simple entities to show basic information when clicked, so that I can quickly understand what I'm looking at without complex interfaces.

#### Acceptance Criteria

1. WHEN clicking on a simple entity THEN the system SHALL display a lightweight info bubble using the inspector framework
2. WHEN displaying simple entity info THEN the system SHALL show the entity name and single-line description
3. WHEN simple entities have additional properties THEN the system SHALL optionally display enrichments like health or output rate
4. WHEN simple entities use the inspector framework THEN the system SHALL maintain consistency with complex entity overlays

### Requirement 6

**User Story:** As a developer, I want a unified data model for inventory and chassis management, so that the system can persist changes immediately and keep all components synchronized.

#### Acceptance Criteria

1. WHEN defining slot schemas THEN the system SHALL record slot identifier, ordering, occupying item reference, and metadata flags
2. WHEN exposing entity models THEN the system SHALL provide inventory data, chassis data, and program state
3. WHEN modifications occur through the overlay THEN the system SHALL persist changes immediately without apply/confirm steps
4. WHEN slot, stack count, or program state updates THEN the system SHALL emit change events for system synchronization
5. WHEN using drag-and-drop operations THEN the system SHALL use live thumbnails as drag previews
6. WHEN performing drop operations THEN the system SHALL snap cleanly to target slot grids with no free placement
7. WHEN drag operations begin THEN the system SHALL broadcast source context for drop validation and atomic swaps
8. WHEN drops are invalid THEN the system SHALL cancel the drag and return items to origin without side effects