import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { SandboxRequest, SandboxResult } from '../src/sandbox/run.js';

const EXAMPLES = join(__dirname, '..', '..', 'examples');
let root: string;
let app: FastifyInstance;

const fakeSandbox = async (request: SandboxRequest): Promise<SandboxResult> => ({
  language: request.language,
  exitStatus: request.code.includes('boom') ? 1 : 0,
  stdout: '["ranked"]',
  stderr: request.code.includes('boom') ? 'boom' : '',
  durationMs: 1,
  timedOut: false,
  output: ['ranked'],
  limits: { timeoutSeconds: 10, maxMemoryMb: 256 },
});

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'skiller-api-'));
  await fs.copyFile(join(EXAMPLES, 'summarize-inbox.md'), join(root, 'summarize-inbox.md'));
  app = await buildApp({ workspaceDir: root, sandbox: fakeSandbox });
});
afterEach(async () => {
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
});

describe('REST API', () => {
  it('lists the tree and reads a parsed file', async () => {
    const tree = await app.inject({ method: 'GET', url: '/api/tree' });
    expect(tree.json().tree.map((entry: { path: string }) => entry.path)).toEqual(['summarize-inbox.md']);
    const file = await app.inject({ method: 'GET', url: '/api/files?path=summarize-inbox.md' });
    expect(file.statusCode).toBe(200);
    expect(file.json().skill.name).toBe('summarize-inbox');
    expect(file.json().skill.nodes).toHaveLength(8);
  });

  it('saves a skill as canonical markdown', async () => {
    const file = (await app.inject({ method: 'GET', url: '/api/files?path=summarize-inbox.md' })).json();
    const skill = { ...file.skill, description: 'changed' };
    const saved = await app.inject({ method: 'PUT', url: '/api/files', payload: { path: 'summarize-inbox.md', skill } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().markdown).toContain('description: changed');
    expect(await fs.readFile(join(root, 'summarize-inbox.md'), 'utf8')).toContain('description: changed');
  });

  it('creates, duplicates, moves and trashes files', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/files/create', payload: { name: 'My New Skill', folder: 'drafts' } });
    expect(created.json().path).toBe('drafts/my-new-skill.md');
    const dup = await app.inject({ method: 'POST', url: '/api/files/duplicate', payload: { path: 'drafts/my-new-skill.md' } });
    expect(dup.json().path).toBe('drafts/my-new-skill copy.md');
    const moved = await app.inject({ method: 'POST', url: '/api/files/move', payload: { from: 'drafts/my-new-skill copy.md', to: 'archive/copy.md' } });
    expect(moved.json().path).toBe('archive/copy.md');
    const trashed = await app.inject({ method: 'POST', url: '/api/files/trash', payload: { path: 'archive/copy.md' } });
    expect(trashed.statusCode).toBe(200);
    const trash = await app.inject({ method: 'GET', url: '/api/trash' });
    expect(trash.json().entries).toHaveLength(1);
    const restored = await app.inject({ method: 'POST', url: '/api/trash/restore', payload: { id: trashed.json().id } });
    expect(restored.json().path).toBe('archive/copy.md');
  });

  it('rejects escaping paths', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/files?path=../etc/passwd' });
    expect(response.statusCode).toBe(400);
  });

  it('imports plain markdown and json', async () => {
    const md = await app.inject({ method: 'POST', url: '/api/import', payload: { text: '# Check\n\n## One\nDo one.\n\n## Two\nDo two.\n', filename: 'check.md' } });
    expect(md.json().foreign).toBe(true);
    expect(md.json().skill.nodes).toHaveLength(3);
    const file = (await app.inject({ method: 'GET', url: '/api/files?path=summarize-inbox.md' })).json();
    const json = await app.inject({ method: 'POST', url: '/api/import', payload: { text: JSON.stringify(file.skill), filename: 'x.json' } });
    expect(json.json().source).toBe('json');
    expect(json.json().skill.nodes).toHaveLength(8);
  });

  it('runs a skill through code steps with the sandbox', async () => {
    const started = await app.inject({ method: 'POST', url: '/api/runs', payload: { skill: 'summarize-inbox', input: null } });
    expect(started.statusCode).toBe(200);
    const runId = started.json().id as string;
    expect(started.json().step.nodeId).toBe(2);
    const next = async (payload: Record<string, unknown>) => (await app.inject({ method: 'POST', url: `/api/runs/${runId}/next`, payload })).json();
    let run = await next({ status: 'ok', output: 'inbox open' });
    expect(run.step.nodeId).toBe(3);
    run = await next({ status: 'ok', choose: 'yes' });
    expect(run.step.type).toBe('loop');
    run = await next({ status: 'ok', output: [{ sender: 'a' }] });
    // Code step 5 executed by the fake sandbox → step 6
    expect(run.step.nodeId).toBe(6);
    expect(run.codeResults).toHaveLength(1);
    expect(run.step.instruction).toContain('["ranked"]');
    run = await next({ status: 'ok', output: 'Five lines.' });
    expect(run.status).toBe('done');
    expect(run.result).toBe('Five lines.');
    const list = await app.inject({ method: 'GET', url: '/api/runs' });
    expect(list.json().runs).toHaveLength(1);
  });

  it('refuses to run a skill with errors', async () => {
    await fs.writeFile(join(root, 'broken.md'), '# B\n\n## 1. Start\n- next: 2\n\n## 2. If: Q\n- yes: 3\n\n## 3. End\n');
    const started = await app.inject({ method: 'POST', url: '/api/runs', payload: { skill: 'broken' } });
    expect(started.statusCode).toBe(500);
    expect(started.json().error).toContain('goes nowhere');
  });
});
