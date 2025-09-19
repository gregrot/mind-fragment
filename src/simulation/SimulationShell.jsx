import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { RootScene } from './rootScene.js';

function SimulationShell() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))) {
      return () => {};
    }

    let app;
    let rootScene;
    let disposed = false;
    let cleanupResize;

    const init = () => {
      app = new Application({
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        resizeTo: containerRef.current,
      });

      if (!containerRef.current || disposed) {
        app.destroy(true, { children: true });
        return;
      }

      containerRef.current.appendChild(app.view);
      rootScene = new RootScene(app);
      rootScene.resize(app.renderer.width, app.renderer.height);

      const handleResize = () => {
        if (!rootScene || disposed) {
          return;
        }
        rootScene.resize(app.renderer.width, app.renderer.height);
      };

      window.addEventListener('resize', handleResize);
      cleanupResize = () => window.removeEventListener('resize', handleResize);
    };

    init();

    const cleanup = () => {
      disposed = true;
      cleanupResize?.();
      rootScene?.destroy();
      if (app) {
        const view = app.view;
        view?.remove?.();
        app.destroy(true, { children: true });
      }
    };

    return cleanup;
  }, []);

  return (
    <section className="simulation-shell" ref={containerRef} aria-label="Simulation shell" />
  );
}

export default SimulationShell;
