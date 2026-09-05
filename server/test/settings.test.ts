import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { SettingsStore, publicSettings } from '../src/settings/store.js';
import { ModelListFailed, listModels } from '../src/settings/models.js';

let root: string;
let app: FastifyInstance;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'skiller-settings-'));
  app = await buildApp({ workspaceDir: root });
});
afterEach(async () => {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('SettingsStore', () => {
  it('returns defaults when nothing is stored', async () => {
    const settings = await new SettingsStore(root).read();
    expect(settings.ai.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(settings.ai.apiKey).toBe('');
  });

  it('merges patches and keeps the key unless it is explicitly cleared', async () => {
    const store = new SettingsStore(root);
    await store.update({ ai: { apiKey: 'sk-secret', model: 'a/b' } });
    expect((await store.update({ ai: { model: 'c/d' } })).ai.apiKey).toBe('sk-secret');
    expect((await store.update({ ai: { apiKey: '' } })).ai.apiKey).toBe('');
  });

  it('writes the file with owner-only permissions', async () => {
    await new SettingsStore(root).update({ ai: { apiKey: 'sk-secret' } });
    const stat = await fs.stat(join(root, '.skiller', 'settings.json'));
    expect(stat.mode & 0o077).toBe(0);
  });

  it('never exposes the key in the public view', () => {
    const view = publicSettings({ ai: { provider: 'openrouter', baseUrl: 'x', apiKey: 'sk-secret', model: 'm' } });
    expect(JSON.stringify(view)).not.toContain('sk-secret');
    expect(view.ai.apiKeySet).toBe(true);
  });
});

describe('settings API', () => {
  it('reads, writes and redacts', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/settings' })).json().ai.apiKeySet).toBe(false);
    const saved = await app.inject({ method: 'PUT', url: '/api/settings', payload: { ai: { apiKey: 'sk-secret', model: 'openai/gpt-4o' } } });
    expect(saved.json().ai.apiKeySet).toBe(true);
    expect(saved.payload).not.toContain('sk-secret');
    expect((await app.inject({ method: 'GET', url: '/api/settings' })).json().ai.model).toBe('openai/gpt-4o');
  });
});

describe('listModels', () => {
  const settings = { provider: 'openrouter', baseUrl: 'https://example.test/api/v1', apiKey: 'sk-key', model: '' };

  it('calls {baseUrl}/models with the key and sorts what comes back', async () => {
    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(String(url)).toBe('https://example.test/api/v1/models');
      expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-key');
      return new Response(JSON.stringify({ data: [{ id: 'z/model' }, { id: 'a/model', name: 'A Model' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await listModels(settings)).toEqual([
      { id: 'a/model', name: 'A Model' },
      { id: 'z/model', name: 'z/model' },
    ]);
  });

  it('tolerates a trailing slash on the base URL', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      expect(String(url)).toBe('https://example.test/api/v1/models');
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await listModels({ ...settings, baseUrl: 'https://example.test/api/v1/' });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('reports a rejected key plainly', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 401 }));
    await expect(listModels(settings)).rejects.toThrow(/rejected the API key/);
  });

  it('refuses an empty or invalid base URL', async () => {
    await expect(listModels({ ...settings, baseUrl: '' })).rejects.toBeInstanceOf(ModelListFailed);
    await expect(listModels({ ...settings, baseUrl: 'not a url' })).rejects.toThrow(/not a valid URL/);
  });

  it('reports an answer that is not a model list', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ hello: 'world' }), { status: 200 }));
    await expect(listModels(settings)).rejects.toThrow(/did not return a model list/);
  });

  it('serves the list over the API using the stored key', async () => {
    vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => {
      expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-stored');
      return new Response(JSON.stringify({ data: [{ id: 'openai/gpt-4o' }] }), { status: 200 });
    });
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { ai: { apiKey: 'sk-stored', baseUrl: 'https://example.test/api/v1' } } });
    const response = await app.inject({ method: 'POST', url: '/api/ai/models', payload: {} });
    expect(response.statusCode).toBe(200);
    expect(response.json().models).toEqual([{ id: 'openai/gpt-4o', name: 'openai/gpt-4o' }]);
  });
});
