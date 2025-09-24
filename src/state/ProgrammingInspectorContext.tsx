import { createContext, useContext, type ReactNode, type DragEvent } from 'react';
import type {
  BlockInstance,
  DragPayload,
  DropTarget,
  WorkspaceState,
} from '../types/blocks';

interface ProgrammingInspectorContextValue {
  workspace: WorkspaceState;
  onDrop: (event: DragEvent<HTMLElement>, target: DropTarget) => void;
  onTouchDrop: (payload: DragPayload, target: DropTarget) => void;
  onUpdateBlock: (instanceId: string, updater: (block: BlockInstance) => BlockInstance) => void;
  onRemoveBlock: (instanceId: string) => void;
  robotId: string;
}

const ProgrammingInspectorContext = createContext<ProgrammingInspectorContextValue | undefined>(
  undefined,
);

export const ProgrammingInspectorProvider = ({
  value,
  children,
}: {
  value: ProgrammingInspectorContextValue;
  children: ReactNode;
}): JSX.Element => {
  return (
    <ProgrammingInspectorContext.Provider value={value}>
      {children}
    </ProgrammingInspectorContext.Provider>
  );
};

export const useProgrammingInspector = (): ProgrammingInspectorContextValue => {
  const context = useContext(ProgrammingInspectorContext);
  if (!context) {
    throw new Error('useProgrammingInspector must be used within a ProgrammingInspectorProvider');
  }
  return context;
};
