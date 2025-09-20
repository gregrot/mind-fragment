import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { RootScene } from './rootScene';
import { simulationRuntime } from '../state/simulationRuntime';

interface SimulationShellProps {
  onRobotSelect?: () => void;
}

const SimulationShell = ({ onRobotSelect }: SimulationShellProps): JSX.Element => {
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

      selectionCleanup = rootScene.subscribeRobotSelection((robotId) => {
        if (robotId) {
          simulationRuntime.setSelectedRobot(robotId);
          onRobotSelect?.();
        } else {
          simulationRuntime.clearSelectedRobot();
        }
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
      className="simulation-shell"
      ref={containerRef}
      aria-label="Simulation shell"
    />
  );
};

export default SimulationShell;
