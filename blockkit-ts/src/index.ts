/**
 * Simplified Stack Blocks Library
 * 
 * A minimal React + TypeScript library for creating Scratch-style visual programming interfaces.
 * Provides drag-and-drop block editing with execution capabilities.
 * 
 * @example
 * ```tsx
 * import { StackEditor, createDefaultRegistry, StackInterpreter } from 'blockkit-ts';
 * 
 * const registry = createDefaultRegistry();
 * const interpreter = new StackInterpreter(registry);
 * 
 * function App() {
 *   const [program, setProgram] = useState({ blocks: [] });
 *   
 *   return (
 *     <StackEditor 
 *       registry={registry}
 *       program={program}
 *       onChange={setProgram}
 *       onExecute={(prog) => interpreter.run(prog)}
 *     />
 *   );
 * }
 * ```
 */

// Core React component for visual programming interface
export { StackEditor } from './StackEditor';

// Block registry and management utilities
export { StackRegistry, DefaultBlocks, createDefaultRegistry } from './StackRegistry';

// Program execution engine
export { StackInterpreter } from './StackInterpreter';

// Serialization utilities for saving/loading programs
export { 
  serializeProgram, 
  deserializeProgram, 
  isValidProgramJson, 
  getProgramStats 
} from './StackSerializer';

// Core type definitions for TypeScript support
export type {
  StackForm,
  InputValue,
  ExecCtx,
  ExecResult,
  StackBlockSpec,
  StackBlock,
  StackProgram
} from './types';

// Serialization type definitions
export type { SerializedProgram } from './StackSerializer';