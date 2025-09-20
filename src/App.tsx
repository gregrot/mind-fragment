import BlockPalette from './components/BlockPalette';
import Workspace from './components/Workspace';
import SimulationShell from './simulation/SimulationShell';
import ModuleInventory from './components/ModuleInventory';
import { BLOCK_LIBRARY } from './blocks/library';
import { useBlockWorkspace } from './hooks/useBlockWorkspace';
import RuntimeControls from './components/RuntimeControls';

function App(): JSX.Element {
  const { workspace, handleDrop } = useBlockWorkspace();

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Mind Fragment Block Builder</h1>
        <p className="app-tagline">Assemble behaviours by combining blocks in the workspace.</p>
      </header>
      <main className="app-main">
        <aside className="panel palette-panel">
          <h2>Block Palette</h2>
          <BlockPalette blocks={BLOCK_LIBRARY} />
        </aside>
        <section className="panel workspace-panel">
          <h2>Workspace</h2>
          <Workspace blocks={workspace} onDrop={handleDrop} />
        </section>
        <section className="panel simulation-panel">
          <h2>Simulation</h2>
          <RuntimeControls workspace={workspace} />
          <SimulationShell />
          <ModuleInventory />
        </section>
      </main>
    </div>
  );
}

export default App;
