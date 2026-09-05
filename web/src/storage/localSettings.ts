/**
 * Provider settings for the static build, where there is no server to hold
 * the key. They live in this browser's localStorage and never leave it except
 * in the Authorization header of a request the person's own browser makes to
 * the provider they chose.
 */
import type { AiSettings } from '@agent-skiller/core';

const KEY = 'skiller.ai';

export const DEFAULT_AI: AiSettings = { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: '' };

export function readLocalAi(): AiSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AiSettings>;
    return {
      provider: typeof parsed.provider === 'string' ? parsed.provider : DEFAULT_AI.provider,
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_AI.baseUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
    };
  } catch {
    return { ...DEFAULT_AI };
  }
}

export function writeLocalAi(patch: Partial<AiSettings>): AiSettings {
  const next = { ...readLocalAi(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // no storage: the values apply for this page only
  }
  return next;
}
