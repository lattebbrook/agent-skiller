import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { GenerationFailed, generateSkill } from '../src/settings/generate.js';
import { formatGuide } from '@agent-skiller/core';

const AI = { provider: 'openrouter', baseUrl: 'https://example.test/api/v1', apiKey: 'sk-key', model: 'test/model' };

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

function answer(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

let root: string;
let app: FastifyInstance;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'skiller-gen-'));
  app = await buildApp({ workspaceDir: root });
});
afterEach(async () => {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('formatGuide', () => {
  it('describes every kind the palette offers and forbids inventing others', () => {
    const guide = formatGuide();
    for (const keyword of ['Start', 'Do', 'Ask', 'If', 'Switch', 'Loop', 'Code', 'Skill', 'Error', 'End']) {
      expect(guide).toContain(`**${keyword}**`);
    }
    expect(guide).toContain('${2: Name of step 2}');
    expect(guide).toContain('Do not invent settings');
  });
});

describe('generateSkill', () => {
  it('sends the guide and the prompt, and returns a parsed skill', async () => {
    const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(String(url)).toBe('https://example.test/api/v1/chat/completions');
      const body = JSON.parse(String(init.body)) as { model: string; messages: { role: string; content: unknown }[] };
      expect(body.model).toBe('test/model');
      expect(String(body.messages[0]!.content)).toContain('AgentSkiller skill');
      const user = body.messages[2]!.content as { type: string; text?: string }[];
      expect(user[0]!.text).toContain('Kind of operation: computer use');
      expect(user[0]!.text).toContain('wave at people');
      return answer(GOOD);
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await generateSkill(AI, { prompt: 'wave at people', operation: 'computer use', attachments: [], context: '', mode: 'skill' });
    expect(result.skill.name).toBe('wave');
    expect(result.skill.nodes).toHaveLength(3);
    expect(result.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(result.repaired).toBe(false);
    expect(result.markdown).toContain('## 2. Do: Wave back');
  });

  it('unwraps a file the model put in a code fence', async () => {
    vi.stubGlobal('fetch', async () => answer('```markdown\n' + GOOD + '```'));
    expect((await generateSkill(AI, { prompt: 'x', operation: '', attachments: [], context: '', mode: 'skill' })).skill.name).toBe('wave');
  });

  it('sends the errors back and accepts the repair', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: { role: string; content: unknown }[] };
      calls.push(String(body.messages[body.messages.length - 1]!.content));
      return answer(calls.length === 1 ? BROKEN : GOOD);
    });
    const result = await generateSkill(AI, { prompt: 'x', operation: '', attachments: [], context: '', mode: 'skill' });
    expect(result.repaired).toBe(true);
    expect(calls[1]).toContain('does not load');
    expect(calls[1]).toContain('goes nowhere');
  });

  it('gives up after one repair, saying what was wrong', async () => {
    vi.stubGlobal('fetch', async () => answer(BROKEN));
    await expect(generateSkill(AI, { prompt: 'x', operation: '', attachments: [], context: '', mode: 'skill' })).rejects.toThrow(/could not produce a valid skill/);
  });

  it('attaches screenshots as image parts and text files as quoted context', async () => {
    let user: { type: string; text?: string; image_url?: { url: string } }[] = [];
    vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: { content: unknown }[] };
      user = body.messages[2]!.content as typeof user;
      return answer(GOOD);
    });
    await generateSkill(AI, {
      prompt: 'x',
      operation: '',
      mode: 'skill',
      context: '',
      attachments: [
        { name: 'shot.png', mimeType: 'image/png', data: Buffer.from('not-really-a-png').toString('base64') },
        { name: 'steps.txt', mimeType: 'text/plain', data: Buffer.from('click the blue Send button').toString('base64') },
      ],
    });
    expect(user.find((part) => part.type === 'image_url')?.image_url?.url).toMatch(/^data:image\/png;base64,/);
    expect(user[0]!.text).toContain('click the blue Send button');
    expect(user[0]!.text).toContain('1 screenshot(s) are attached');
  });

  it('passes the open skill along when adding steps', async () => {
    let text = '';
    vi.stubGlobal('fetch', async (_url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { messages: { content: unknown }[] };
      text = (body.messages[2]!.content as { text: string }[])[0]!.text;
      return answer(GOOD);
    });
    await generateSkill(AI, { prompt: 'x', operation: '', attachments: [], context: '## 1. Start\n- next: 2\n', mode: 'steps' });
    expect(text).toContain('added to this existing skill');
    expect(text).toContain('## 1. Start');
  });

  it('refuses before calling out when there is no model or no prompt', async () => {
    await expect(generateSkill({ ...AI, model: '' }, { prompt: 'x', operation: '', attachments: [], context: '', mode: 'skill' })).rejects.toBeInstanceOf(GenerationFailed);
    await expect(generateSkill(AI, { prompt: '  ', operation: '', attachments: [], context: '', mode: 'skill' })).rejects.toThrow(/Say what the skill should do/);
  });
});

describe('generate API', () => {
  it('generates through the stored settings', async () => {
    vi.stubGlobal('fetch', async () => answer(GOOD));
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { ai: { baseUrl: 'https://example.test/api/v1', apiKey: 'sk', model: 'test/model' } } });
    const response = await app.inject({ method: 'POST', url: '/api/ai/generate', payload: { prompt: 'wave', operation: 'computer use' } });
    expect(response.statusCode).toBe(200);
    expect(response.json().skill.name).toBe('wave');
  });

  it('refuses oversized attachments before calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await app.inject({ method: 'PUT', url: '/api/settings', payload: { ai: { model: 'test/model' } } });
    const big = 'A'.repeat(6 * 1024 * 1024);
    const response = await app.inject({ method: 'POST', url: '/api/ai/generate', payload: { prompt: 'x', attachments: [{ name: 'big.png', mimeType: 'image/png', data: big }] } });
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
