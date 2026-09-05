/**
 * One door for everything that talks to a model. In server mode the server
 * holds the key and makes the call; in the static build the browser does
 * both, with the shared client from core.
 */
import { generateSkill, listModels, type AiSettings, type Attachment, type GenerateResult, type ModelOption } from '@agent-skiller/core';
import { api, type PublicSettings } from './api.js';
import { readLocalAi, writeLocalAi } from './storage/localSettings.js';
import { useWorkspaceStore } from './store/workspaceStore.js';

export type AiMode = 'server' | 'browser';

export function aiMode(): AiMode {
  return useWorkspaceStore.getState().info?.hasServer ? 'server' : 'browser';
}

export interface SettingsView extends PublicSettings {
  mode: AiMode;
}

const browserFetch = (url: string, init?: RequestInit) => fetch(url, init);

function publicView(ai: AiSettings): PublicSettings {
  return { ai: { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, apiKeySet: ai.apiKey.trim().length > 0 } };
}

export const ai = {
  async settings(): Promise<SettingsView> {
    if (aiMode() === 'server') return { ...(await api.settings()), mode: 'server' };
    return { ...publicView(readLocalAi()), mode: 'browser' };
  },

  /** `apiKey: ''` clears; an absent apiKey keeps what is stored, in both modes. */
  async saveSettings(patch: { ai?: Partial<AiSettings> }): Promise<SettingsView> {
    if (aiMode() === 'server') return { ...(await api.saveSettings(patch)), mode: 'server' };
    return { ...publicView(writeLocalAi(patch.ai ?? {})), mode: 'browser' };
  },

  async models(probe: { baseUrl?: string; apiKey?: string } = {}): Promise<ModelOption[]> {
    if (aiMode() === 'server') return (await api.aiModels(probe)).models;
    const stored = readLocalAi();
    return listModels({ ...stored, baseUrl: probe.baseUrl ?? stored.baseUrl, apiKey: probe.apiKey || stored.apiKey }, browserFetch);
  },

  async generate(request: { prompt: string; operation: string; mode: 'skill' | 'steps'; context: string; attachments: Attachment[] }): Promise<GenerateResult> {
    if (aiMode() === 'server') return api.aiGenerate(request);
    return generateSkill(readLocalAi(), request, browserFetch);
  },
};
