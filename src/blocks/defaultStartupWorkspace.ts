import type { WorkspaceState } from '../types/blocks';
import serializedWorkspace from './defaultStartupWorkspace.serialized.json';

const cloneWorkspace = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

const DEFAULT_STARTUP_WORKSPACE: WorkspaceState = serializedWorkspace as WorkspaceState;

export const createDefaultStartupWorkspace = (): WorkspaceState =>
  cloneWorkspace(DEFAULT_STARTUP_WORKSPACE);
