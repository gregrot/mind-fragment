import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface RobotProgrammingOverlayContextValue {
  selectedRobotId: string | null;
  isOpen: boolean;
  openOverlay: (robotId: string) => void;
  closeOverlay: () => void;
}

const RobotProgrammingOverlayContext = createContext<RobotProgrammingOverlayContextValue | undefined>(undefined);

export const RobotProgrammingOverlayProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);

  const openOverlay = useCallback((robotId: string) => {
    setSelectedRobotId(robotId);
  }, []);

  const closeOverlay = useCallback(() => {
    setSelectedRobotId(null);
  }, []);

  const value = useMemo<RobotProgrammingOverlayContextValue>(
    () => ({
      selectedRobotId,
      isOpen: selectedRobotId !== null,
      openOverlay,
      closeOverlay,
    }),
    [closeOverlay, openOverlay, selectedRobotId],
  );

  return <RobotProgrammingOverlayContext.Provider value={value}>{children}</RobotProgrammingOverlayContext.Provider>;
};

export const useRobotProgrammingOverlay = (): RobotProgrammingOverlayContextValue => {
  const context = useContext(RobotProgrammingOverlayContext);
  if (!context) {
    throw new Error('useRobotProgrammingOverlay must be used within a RobotProgrammingOverlayProvider');
  }
  return context;
};
