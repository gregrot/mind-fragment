import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { RootScene } from './rootScene';
import { simulationRuntime } from '../state/simulationRuntime';
import type { EntityId } from './ecs/world';
import styles from '../styles/SimulationShell.module.css';

interface SimulationShellProps {
  onEntitySelect?: (selection: { mechanismId: string; entityId: EntityId }) => void;
  onEntityClear?: () => void;
}

const SimulationShell = ({ onEntitySelect, onEntityClear }: SimulationShellProps): JSX.Element => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))) {
      return () => {};
    }

    let app: Application | null = null;
    let rootScene: RootScene | null = null;
    let disposed = false;
    let cleanupResize: (() => void) | undefined;
    let selectionCleanup: (() => void) | undefined;
    let hasAnnouncedFirstMechanism = false;

    const init = async () => {
      const container = containerRef.current;
      if (!container || disposed) {
        return;
      }

      const instance = new Application();
      try {
        await instance.init({
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
          resizeTo: container,
        });
      } catch (error) {
        console.error('Failed to initialise simulation shell', error);
        instance.destroy(true, { children: true });
        return;
      }

      if (!containerRef.current || disposed) {
        instance.destroy(true, { children: true });
        return;
      }

      app = instance;
      const activeApp = app;
      const view = (activeApp as Application & { canvas?: HTMLCanvasElement }).canvas ?? activeApp.view;
      containerRef.current.appendChild(view as HTMLElement);
      rootScene = new RootScene(activeApp);
      simulationRuntime.registerScene(rootScene);
      rootScene.resize(activeApp.renderer.width, activeApp.renderer.height);

      selectionCleanup = rootScene.subscribeMechanismSelection((mechanismId, entityId) => {
        if (mechanismId) {
          simulationRuntime.setSelectedMechanism(mechanismId, entityId ?? undefined);
          if (hasAnnouncedFirstMechanism) {
            if (entityId !== null && entityId !== undefined) {
              onEntitySelect?.({ mechanismId, entityId });
            }
          } else {
            hasAnnouncedFirstMechanism = true;
          }
          return;
        }
        simulationRuntime.clearSelectedMechanism();
        onEntityClear?.();
      });

      const handleResize = () => {
        if (!rootScene || disposed) {
          return;
        }
        rootScene.resize(activeApp.renderer.width, activeApp.renderer.height);
      };

      window.addEventListener('resize', handleResize);
      cleanupResize = () => window.removeEventListener('resize', handleResize);
    };

    init();

    const cleanup = () => {
      disposed = true;
      cleanupResize?.();
      selectionCleanup?.();
      if (rootScene) {
        simulationRuntime.unregisterScene(rootScene);
        rootScene.destroy();
        rootScene = null;
      }
      const activeApp = app;
      if (activeApp) {
        const view = (activeApp as Application & { canvas?: HTMLCanvasElement }).canvas ?? activeApp.view;
        (view as HTMLElement | undefined)?.remove?.();
        activeApp.destroy(true, { children: true });
        app = null;
      }
    };

    return cleanup;
  }, []);

  return (
    <section
      className={`${styles.shell} simulation-shell`}
      ref={containerRef}
      aria-label="Simulation shell"
    />
  );
};

export default SimulationShell;
