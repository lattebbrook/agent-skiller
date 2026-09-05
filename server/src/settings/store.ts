/**
 * Application settings, kept in <workspace>/.skiller/settings.json.
 *
 * The API key lives here rather than in the browser: the server is the only
 * thing that talks to the model provider, so the key never reaches the page
 * and a browser cannot be talked into leaking it. Reads that go to the client
 * are redacted by publicSettings().
 */
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

import type { AiSettings } from '@agent-skiller/core';
export type { AiSettings };

export interface Settings {
  ai: AiSettings;
}

export interface PublicSettings {
  ai: Omit<AiSettings, 'apiKey'> & { apiKeySet: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  ai: { provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '', model: '' },
};

export class SettingsStore {
  private readonly file: string;

  constructor(workspaceDir: string) {
    this.file = join(workspaceDir, '.skiller', 'settings.json');
  }

  async read(): Promise<Settings> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<Settings>;
      const ai = (raw.ai ?? {}) as Partial<AiSettings>;
      return {
        ai: {
          provider: typeof ai.provider === 'string' ? ai.provider : DEFAULT_SETTINGS.ai.provider,
          baseUrl: typeof ai.baseUrl === 'string' ? ai.baseUrl : DEFAULT_SETTINGS.ai.baseUrl,
          apiKey: typeof ai.apiKey === 'string' ? ai.apiKey : '',
          model: typeof ai.model === 'string' ? ai.model : '',
        },
      };
    } catch {
      // No file yet, or an unreadable one: the defaults are the answer.
      return { ai: { ...DEFAULT_SETTINGS.ai } };
    }
  }

  /** Merges a patch. An absent apiKey keeps the stored one; an empty string clears it. */
  async update(patch: { ai?: Partial<AiSettings> }): Promise<Settings> {
    const current = await this.read();
    const next: Settings = {
      ai: {
        provider: patch.ai?.provider ?? current.ai.provider,
        baseUrl: patch.ai?.baseUrl ?? current.ai.baseUrl,
        apiKey: patch.ai?.apiKey === undefined ? current.ai.apiKey : patch.ai.apiKey,
        model: patch.ai?.model ?? current.ai.model,
      },
    };
    await fs.mkdir(dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return next;
  }
}

export function publicSettings(settings: Settings): PublicSettings {
  const { apiKey, ...rest } = settings.ai;
  return { ai: { ...rest, apiKeySet: apiKey.trim().length > 0 } };
}
