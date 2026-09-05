/**
 * Runs, from whichever side can do them: the server when there is one (Code
 * steps execute there), otherwise the in-page walker.
 */
import type { Skill, StepEvent } from '@agent-skiller/core';
import { api, type RunView } from './api.js';
import { localRuns } from './runs/localRuns.js';
import { useWorkspaceStore } from './store/workspaceStore.js';

function hasServer(): boolean {
  return useWorkspaceStore.getState().info?.hasServer === true;
}

export const runs = {
  hasSandbox: () => hasServer(),
  async list(): Promise<RunView[]> {
    return hasServer() ? (await api.listRuns()).runs : localRuns.list();
  },
  async start(skill: Skill, input: unknown): Promise<RunView> {
    return hasServer() ? api.startRun(skill.name, input) : localRuns.start(skill, input);
  },
  async next(id: string, event: StepEvent): Promise<RunView> {
    return hasServer() ? api.nextStep(id, event) : localRuns.next(id, event);
  },
};
