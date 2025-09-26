import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface MechanismProgrammingOverlayContextValue {
  selectedMechanismId: string | null;
  isOpen: boolean;
  openOverlay: (mechanismId: string) => void;
  closeOverlay: () => void;
}

const MechanismProgrammingOverlayContext = createContext<MechanismProgrammingOverlayContextValue | undefined>(undefined);

export const MechanismProgrammingOverlayProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [selectedMechanismId, setSelectedMechanismId] = useState<string | null>(null);

  const openOverlay = useCallback((mechanismId: string) => {
    setSelectedMechanismId(mechanismId);
  }, []);

  const closeOverlay = useCallback(() => {
    setSelectedMechanismId(null);
  }, []);

  const value = useMemo<MechanismProgrammingOverlayContextValue>(
    () => ({
      selectedMechanismId,
      isOpen: selectedMechanismId !== null,
      openOverlay,
      closeOverlay,
    }),
    [closeOverlay, openOverlay, selectedMechanismId],
  );

  return <MechanismProgrammingOverlayContext.Provider value={value}>{children}</MechanismProgrammingOverlayContext.Provider>;
};

export const useMechanismProgrammingOverlay = (): MechanismProgrammingOverlayContextValue => {
  const context = useContext(MechanismProgrammingOverlayContext);
  if (!context) {
    throw new Error('useMechanismProgrammingOverlay must be used within a MechanismProgrammingOverlayProvider');
  }
  return context;
};
