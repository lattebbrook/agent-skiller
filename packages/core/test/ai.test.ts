import { describe, expect, it } from 'vitest';
import { AiError, generateSkill, listModels, type AiSettings, type FetchLike } from '../src/index.js';

const AI: AiSettings = { provider: 'openrouter', baseUrl: 'https://example.test/api/v1', apiKey: 'sk-key', model: 'test/model' };

const GOOD = `---
name: wave
description: Wave at the user.
tags: [demo]
version: 1
format: agent-skiller/1
---

# Wave

## 1. Start
- when: the user says hello
- next: 2

## 2. Do: Wave back
Say hello and wave.
- next: 3

## 3. End: Done
Report that you waved.
`;

const BROKEN = `# Wave

## 1. Start
- next: 2

## 2. If: Should I wave?
- yes: 3

## 3. End
`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const chat = (content: string) => json({ choices: [{ message: { content } }] });
const req = { prompt: 'wave at people', operation: 'computer use', attachments: [], context: '', mode: 'skill' as const };

describe('listModels', () => {
  it('calls {baseUrl}/models with the key and sorts the answer', async () => {
    const calls: { url: string; auth: string }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, auth: (init?.headers as Record<string, string>)['authorization'] ?? '' });
      return json({ data: [{ id: 'z/model' }, { id: 'a/model', name: 'A Model' }] });
    };
    expect(await listModels(AI, fetchImpl)).toEqual([
      { id: 'a/model', name: 'A Model' },
      { id: 'z/model', name: 'z/model' },
    ]);
    expect(calls).toEqual([{ url: 'https://example.test/api/v1/models', auth: 'Bearer sk-key' }]);
  });

  it('tolerates a trailing slash and reads Ollama-style "models" arrays', async () => {
    let seen = '';
    const fetchImpl: FetchLike = async (url) => {
      seen = url;
      return json({ models: [{ name: 'llama3' }] });
    };
    expect(await listModels({ ...AI, baseUrl: 'https://example.test/api/v1/' }, fetchImpl)).toEqual([{ id: 'llama3', name: 'llama3' }]);
    expect(seen).toBe('https://example.test/api/v1/models');
  });

  it('reports a rejected key, an empty base URL and a non-list answer plainly', async () => {
    await expect(listModels(AI, async () => new Response('nope', { status: 401 }))).rejects.toThrow(/rejected the API key/);
    await expect(listModels({ ...AI, baseUrl: '' }, async () => json({}))).rejects.toBeInstanceOf(AiError);
    await expect(listModels(AI, async () => json({ hello: 'world' }))).rejects.toThrow(/did not return a model list/);
  });
});

describe('generateSkill', () => {
  it('sends the guide, the example and the prompt, and returns a parsed skill', async () => {
    let body: { model: string; messages: { role: string; content: unknown }[] } | null = null;
    const fetchImpl: FetchLike = async (url, init) => {
      expect(url).toBe('https://example.test/api/v1/chat/completions');
      body = JSON.parse(String(init?.body));
      return chat(GOOD);
    };
    const result = await generateSkill(AI, req, fetchImpl);
    expect(body!.model).toBe('test/model');
    expect(String(body!.messages[0]!.content)).toContain('AgentSkiller skill');
    expect(String(body!.messages[1]!.content)).toContain('## 1. Start');
    const user = body!.messages[2]!.content as { text?: string }[];
    expect(user[0]!.text).toContain('Kind of operation: computer use');
    expect(result.skill.name).toBe('wave');
    expect(result.skill.nodes).toHaveLength(3);
    expect(result.repaired).toBe(false);
    expect(result.markdown).toContain('## 2. Do: Wave back');
  });

  it('unwraps a fenced answer', async () => {
    expect((await generateSkill(AI, req, async () => chat('```markdown\n' + GOOD + '```'))).skill.name).toBe('wave');
  });

  it('sends the errors back once and accepts the repair', async () => {
    const lastUserMessages: string[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: { content: unknown }[] };
      lastUserMessages.push(String(body.messages[body.messages.length - 1]!.content));
      return chat(lastUserMessages.length === 1 ? BROKEN : GOOD);
    };
    const result = await generateSkill(AI, req, fetchImpl);
    expect(result.repaired).toBe(true);
    expect(lastUserMessages[1]).toContain('does not load');
    expect(lastUserMessages[1]).toContain('goes nowhere');
  });

  it('gives up after one repair', async () => {
    await expect(generateSkill(AI, req, async () => chat(BROKEN))).rejects.toThrow(/could not produce a valid skill/);
  });

  it('attaches screenshots as image parts and text files as quoted context', async () => {
    let user: { type: string; text?: string; image_url?: { url: string } }[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      user = (JSON.parse(String(init?.body)) as { messages: { content: unknown }[] }).messages[2]!.content as typeof user;
      return chat(GOOD);
    };
    await generateSkill(
      AI,
      {
        ...req,
        attachments: [
          { name: 'shot.png', mimeType: 'image/png', data: btoa('not-really-a-png') },
          { name: 'steps.txt', mimeType: 'text/plain', data: btoa('click the blue Send button') },
        ],
      },
      fetchImpl,
    );
    expect(user.find((part) => part.type === 'image_url')?.image_url?.url).toMatch(/^data:image\/png;base64,/);
    expect(user[0]!.text).toContain('click the blue Send button');
    expect(user[0]!.text).toContain('1 screenshot(s) are attached');
  });

  it('passes the open skill along when adding steps', async () => {
    let text = '';
    const fetchImpl: FetchLike = async (_url, init) => {
      text = ((JSON.parse(String(init?.body)) as { messages: { content: unknown }[] }).messages[2]!.content as { text: string }[])[0]!.text;
      return chat(GOOD);
    };
    await generateSkill(AI, { ...req, mode: 'steps', context: '## 1. Start\n- next: 2\n' }, fetchImpl);
    expect(text).toContain('added to this existing skill');
    expect(text).toContain('## 1. Start');
  });

  it('refuses before calling out when there is no model, no prompt, or oversized attachments', async () => {
    const never: FetchLike = async () => {
      throw new Error('should not be called');
    };
    await expect(generateSkill({ ...AI, model: '' }, req, never)).rejects.toBeInstanceOf(AiError);
    await expect(generateSkill(AI, { ...req, prompt: '  ' }, never)).rejects.toThrow(/Say what the skill should do/);
    await expect(generateSkill(AI, { ...req, attachments: [{ name: 'big', mimeType: 'image/png', data: 'A'.repeat(6 * 1024 * 1024) }] }, never)).rejects.toThrow(/more than 4 MB/);
  });
});
