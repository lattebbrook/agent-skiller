import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../src/mcp/tools.js';
import { RunService } from '../src/runs/RunService.js';
import { FileStore } from '../src/workspace/files.js';
import type { SandboxRequest, SandboxResult } from '../src/sandbox/run.js';

const EXAMPLES = join(__dirname, '..', '..', 'examples');
let root: string;
let client: Client;

const fakeSandbox = async (request: SandboxRequest): Promise<SandboxResult> => ({
  language: request.language,
  exitStatus: 0,
  stdout: '"ok"',
  stderr: '',
  durationMs: 1,
  timedOut: false,
  output: 'ok',
  limits: { timeoutSeconds: 10, maxMemoryMb: 256 },
});

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'skiller-mcp-'));
  await fs.copyFile(join(EXAMPLES, 'file-triage.md'), join(root, 'file-triage.md'));
  const files = new FileStore(root);
  await files.init();
  const runs = new RunService(files, fakeSandbox, join(root, '.runs'));
  const server = buildMcpServer({ files, runs, sandbox: fakeSandbox });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
});
afterEach(async () => {
  await client.close();
  await fs.rm(root, { recursive: true, force: true });
});

const textOf = (result: unknown) => ((result as { content: { text: string }[] }).content[0]?.text ?? '');

describe('MCP tools', () => {
  it('lists the expected tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(['get_run', 'get_skill', 'list_skills', 'next_step', 'run_code', 'save_skill', 'skill_format', 'start_run', 'validate_skill']);
  });

  it('lists and fetches skills', async () => {
    expect(textOf(await client.callTool({ name: 'list_skills', arguments: {} }))).toContain('file-triage');
    expect(textOf(await client.callTool({ name: 'get_skill', arguments: { name: 'file-triage' } }))).toContain('## 3. Switch: What is the file extension?');
    const missing = await client.callTool({ name: 'get_skill', arguments: { name: 'nope' } });
    expect(missing.isError).toBe(true);
  });

  it('validates and saves skills, refusing broken ones', async () => {
    const ok = await client.callTool({ name: 'validate_skill', arguments: { content: '---\nname: t\ndescription: d\n---\n# T\n\n## 1. Start\n- next: 2\n\n## 2. End\ndone\n' } });
    expect(textOf(ok)).toBe('ok');
    const saved = await client.callTool({ name: 'save_skill', arguments: { name: 'tiny', content: '# T\n\n## 1. Start\n- next: 2\n\n## 2. End\ndone\n' } });
    expect(textOf(saved)).toContain('Created tiny.md');
    expect(await fs.readFile(join(root, 'tiny.md'), 'utf8')).toContain('name: tiny');
    const refused = await client.callTool({ name: 'save_skill', arguments: { name: 'bad', content: '# B\n\n## 1. Start\n' } });
    expect(refused.isError).toBe(true);
  });

  it('walks a run step by step', async () => {
    const started = textOf(await client.callTool({ name: 'start_run', arguments: { skill: 'file-triage', input: '/tmp/x.pdf' } }));
    const runId = /run_id: (\S+)/.exec(started)![1]!;
    expect(started).toContain('Step 2 · Do: Inspect the file');
    expect(started).toContain('Open Finder at /tmp/x.pdf.');
    let text = textOf(await client.callTool({ name: 'next_step', arguments: { run_id: runId, status: 'ok', output: { name: 'x.pdf', ext: 'pdf' } } }));
    expect(text).toContain('Step 3 · Switch');
    expect(text).toContain('Choices: pdf | png | zip | default');
    text = textOf(await client.callTool({ name: 'next_step', arguments: { run_id: runId, status: 'ok', choose: 'pdf' } }));
    expect(text).toContain('Step 4 · Do: File the PDF');
    text = textOf(await client.callTool({ name: 'next_step', arguments: { run_id: runId, status: 'ok' } }));
    expect(text).toContain('Step 9 · End: Done');
    text = textOf(await client.callTool({ name: 'next_step', arguments: { run_id: runId, status: 'ok', output: 'Filed in Documents/PDFs' } }));
    expect(text).toContain('status: done');
    const trace = JSON.parse(textOf(await client.callTool({ name: 'get_run', arguments: { run_id: runId } })));
    expect(trace.steps.map((step: { nodeId: number }) => step.nodeId)).toEqual([1, 2, 3, 4, 9]);
  });

  it('hands out the format guide for authoring', async () => {
    const guide = textOf(await client.callTool({ name: 'skill_format', arguments: {} }));
    expect(guide).toContain('AgentSkiller skill');
    expect(guide).toContain('**Switch**');
  });

  it('runs code through the sandbox tool', async () => {
    const result = await client.callTool({ name: 'run_code', arguments: { code: 'print(1)' } });
    expect(textOf(result)).toContain('Exit 0');
  });
});
