# Design Document

## Overview

The mechanism overlay and inventory system will provide a unified interface for managing mechanism entities through a modernized overlay framework. The design builds upon the existing `SimulationOverlay` component but extends it to support multiple entity types with a flexible inspector-based architecture. The system will handle chassis configuration, inventory management, and programming through a tabbed interface with immediate persistence and drag-and-drop interactions.

## Architecture

### Core Components

The system follows a modular architecture with these key components:

1. **EntityOverlayManager** - Central coordinator for overlay lifecycle and entity selection
2. **Inspector Framework** - Composable UI components for different entity aspects
3. **Drag-and-Drop System** - Unified handling for item and module movement
4. **Data Layer** - Shared schemas and persistence for entity state

### Component Hierarchy

```
EntityOverlayManager
├── EntityOverlay (modal container)
│   ├── OverlayHeader (entity info, close controls)
│   ├── TabNavigation (inspector tabs)
│   └── TabContent
│       ├── SystemsTab
│       │   ├── ChassisInspector
│       │   └── InventoryInspector
│       ├── ProgrammingTab
│       │   └── ProgramInspector
│       └── InfoTab (simple entities)
│           └── EntityInfoInspector
└── DragPreviewLayer (live thumbnails during drag)
```

### Integration with Existing Systems

The design leverages existing infrastructure:

- **ECS World**: Entity selection and state management
- **MechanismChassis**: Module attachment and inventory operations
- **Block Programming**: Existing workspace and runtime controls
- **Module Library**: Blueprint definitions and instantiation

## Components and Interfaces

### EntityOverlayManager

Central state manager for overlay operations:

```typescript
interface EntityOverlayManager {
  selectedEntity: EntityId | null;
  overlayType: 'complex' | 'simple' | null;
  activeTab: string;
  
  openOverlay(entityId: EntityId): void;
  closeOverlay(): void;
  setActiveTab(tab: string): void;
}
```

**Responsibilities:**
- Track selected entity and overlay state
- Determine overlay type based on entity components
- Handle click-outside and escape key closing
- Maintain focus state for repeated selections

### Inspector Framework

Base interface for all inspector components:

```typescript
interface Inspector {
  entityId: EntityId;
  isReadOnly?: boolean;
  onDataChange?: (data: unknown) => void;
}

interface InspectorDefinition {
  id: string;
  label: string;
  component: React.ComponentType<Inspector>;
  shouldRender: (entityId: EntityId) => boolean;
  getTabGroup: () => 'systems' | 'programming' | 'info';
}
```

**Inspector Types:**
- **ChassisInspector**: Module slot management with drag-and-drop
- **InventoryInspector**: Item storage and organization
- **ProgramInspector**: Block programming interface (reuses existing components)
- **EntityInfoInspector**: Simple entity information display

### ChassisInspector

Manages mechanism module configuration:

```typescript
interface ChassisSlot {
  id: string;
  index: number;
  moduleId: string | null;
  acceptsAny: boolean;
  constraints?: string[];
}

interface ChassisInspectorProps extends Inspector {
  slots: ChassisSlot[];
  onModuleSwap: (fromSlot: string, toSlot: string) => void;
  onModuleMove: (moduleId: string, targetSlot: string) => void;
}
```

**Features:**
- 3 generic slots by default (configurable per chassis)
- Live module thumbnails and tooltips
- Drag-and-drop for swapping and moving modules
- Visual feedback for valid drop targets

### InventoryInspector

Manages entity inventory:

```typescript
interface InventorySlot {
  id: string;
  index: number;
  itemId: string | null;
  stackCount: number;
  maxStack: number;
}

interface InventoryInspectorProps extends Inspector {
  capacity: number;
  slots: InventorySlot[];
  onItemMove: (fromSlot: string, toSlot: string) => void;
  onStackSplit: (slotId: string, amount: number) => void;
}
```

**Features:**
- 10 slots by default (configurable per entity)
- Automatic stacking for compatible items
- Drag-and-drop reordering and swapping
- Stack count display and split operations

### Drag-and-Drop System

Unified system for all drag operations:

```typescript
interface DragContext {
  sourceType: 'chassis' | 'inventory' | 'palette';
  sourceId: string;
  itemData: ModuleBlueprint | InventoryItem;
  preview: React.ReactNode;
}

interface DropTarget {
  targetType: 'chassis' | 'inventory';
  targetId: string;
  accepts: (context: DragContext) => boolean;
  onDrop: (context: DragContext) => void;
}
```

**Features:**
- Live thumbnail previews during drag
- Snap-to-grid placement
- Atomic swap operations
- Invalid drop cancellation with return-to-origin

## Data Models

### Unified Slot Schema

Shared data structure for all slot-based storage:

```typescript
interface SlotSchema {
  id: string;
  index: number;
  occupantId: string | null;
  stackCount?: number;
  metadata: {
    stackable: boolean;
    moduleSubtype?: string;
    locked: boolean;
  };
}
```

### Entity Data Interface

Extended entity model for overlay support:

```typescript
interface EntityOverlayData {
  entityId: EntityId;
  name: string;
  description: string;
  overlayType: 'complex' | 'simple';
  
  // Complex entities
  chassis?: {
    capacity: number;
    slots: SlotSchema[];
  };
  
  inventory?: {
    capacity: number;
    slots: SlotSchema[];
  };
  
  programState?: {
    program: WorkspaceState;
    isRunning: boolean;
    activeBlockId?: string;
  };
  
  // Simple entities
  properties?: Record<string, unknown>;
}
```

### Integration with Existing Models

The design extends existing models without breaking changes:

- **MechanismChassis**: Add slot schema conversion methods
- **InventoryStore**: Add slot-based access methods
- **ModuleStack**: Add slot ordering and metadata
- **ECS Components**: Add overlay-specific component types

## Error Handling

### Drag-and-Drop Errors

- **Invalid Drop**: Return item to origin with visual feedback
- **Capacity Exceeded**: Show error message and prevent drop
- **Module Conflicts**: Validate dependencies before allowing drops
- **Network Errors**: Queue operations and retry with user notification

### State Synchronization

- **Concurrent Modifications**: Use optimistic updates with rollback
- **Persistence Failures**: Show retry options and maintain local state
- **Component Unmounting**: Cancel pending operations gracefully

### User Experience

- **Loading States**: Show skeleton UI during data fetching
- **Error Messages**: Clear, actionable error descriptions
- **Accessibility**: Full keyboard navigation and screen reader support

## Testing Strategy

### Unit Tests

- **Inspector Components**: Render with various entity states
- **Drag-and-Drop Logic**: Validate drop rules and state changes
- **Data Transformations**: Slot schema conversions and validations
- **State Management**: Entity selection and overlay lifecycle

### Integration Tests

- **End-to-End Workflows**: Complete module swapping scenarios
- **Cross-Component Communication**: Inspector data synchronization
- **Persistence Layer**: Immediate save and load operations
- **Error Recovery**: Network failures and retry mechanisms

### Performance Tests

- **Large Inventories**: Rendering with many items
- **Frequent Updates**: Real-time telemetry and state changes
- **Memory Usage**: Component mounting/unmounting cycles
- **Drag Performance**: Smooth preview updates during drag operations

## Implementation Phases

### Phase 1: Core Infrastructure
- EntityOverlayManager and base overlay components
- Inspector framework and registration system
- Basic drag-and-drop infrastructure
- Simple entity info bubbles

### Phase 2: Chassis Management
- ChassisInspector implementation
- Module slot drag-and-drop
- Integration with existing ModuleStack
- Tooltip and preview systems

### Phase 3: Inventory System
- InventoryInspector implementation
- Item stacking and organization
- Cross-inspector drag operations
- Persistence and synchronization

### Phase 4: Programming Integration
- ProgramInspector adaptation
- Execution state awareness
- Module dependency warnings
- Runtime control integration

### Phase 5: Polish and Optimization
- Performance optimizations
- Accessibility improvements
- Error handling refinements
- User experience enhancements