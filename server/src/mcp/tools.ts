/**
 * The MCP face of the server: what an agent sees when it connects.
 * One McpServer per connection; the tools close over shared services.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { describeStep, formatGuide, hasErrors, importText, serializeMarkdown, toJson, validateSkill, type StepEvent } from '@agent-skiller/core';
import type { FileStore } from '../workspace/files.js';
import type { RunService, RunView } from '../runs/RunService.js';
import type { SandboxRequest, SandboxResult } from '../sandbox/run.js';

export interface McpDeps {
  files: FileStore;
  runs: RunService;
  sandbox: (request: SandboxRequest) => Promise<SandboxResult>;
}

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const failure = (value: string) => ({ content: [{ type: 'text' as const, text: value }], isError: true });

export function buildMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: 'agent-skiller', version: '0.1.0' });

  server.registerTool(
    'list_skills',
    {
      title: 'List skills',
      description: 'Lists every skill in the workspace with its name, description and tags. Use it to pick the skill that matches the task.',
      inputSchema: {},
    },
    async () => {
      const skills = await deps.files.listSkills();
      if (skills.length === 0) return text('The workspace has no skills yet.');
      return text(skills.map((skill) => `- ${skill.name}: ${skill.description || skill.title}${skill.tags.length ? ` [${skill.tags.join(', ')}]` : ''}`).join('\n'));
    },
  );

  server.registerTool(
    'get_skill',
    {
      title: 'Get skill',
      description: 'Returns the full skill file by name, as Markdown (default) or JSON.',
      inputSchema: { name: z.string(), format: z.enum(['md', 'json']).optional() },
    },
    async ({ name, format }) => {
      const found = await deps.files.findSkill(name);
      if (!found) return failure(`No skill named "${name}". Call list_skills to see what exists.`);
      return text(format === 'json' ? toJson(found.skill) : found.text);
    },
  );

  server.registerTool(
    'skill_format',
    {
      title: 'Skill format',
      description: 'The rules for writing a skill file: the headings, the settings, the arrows and the kinds of step. Read this before calling save_skill.',
      inputSchema: {},
    },
    async () => text(formatGuide()),
  );

  server.registerTool(
    'validate_skill',
    {
      title: 'Validate skill',
      description: 'Checks a skill written in Markdown (or JSON) without saving it. Returns problems, or "ok".',
      inputSchema: { content: z.string() },
    },
    async ({ content }) => {
      try {
        const { skill, diagnostics } = importText(content);
        const problems = validateSkill(skill);
        const lines = [
          ...diagnostics.map((diagnostic) => `${diagnostic.severity}: ${diagnostic.message}`),
          ...problems.map((problem) => `${problem.severity}${problem.nodeId ? ` (node ${problem.nodeId})` : ''}: ${problem.message}`),
        ];
        return text(lines.length ? lines.join('\n') : 'ok');
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  );

  server.registerTool(
    'save_skill',
    {
      title: 'Save skill',
      description: 'Writes a skill to the workspace as <name>.md in canonical Markdown. The content may be Markdown or JSON; it is validated first and refused when it has errors.',
      inputSchema: { name: z.string(), content: z.string(), folder: z.string().optional() },
    },
    async ({ name, content, folder }) => {
      try {
        const { skill } = importText(content);
        const problems = validateSkill(skill);
        if (hasErrors(problems)) {
          return failure(`Not saved; fix these first:\n${problems.filter((problem) => problem.severity === 'error').map((problem) => `- ${problem.nodeId ? `node ${problem.nodeId}: ` : ''}${problem.message}`).join('\n')}`);
        }
        const slug = name.trim().replace(/\.md$/i, '');
        const relativePath = `${folder ? `${folder.replace(/\/+$/, '')}/` : ''}${slug}.md`;
        const markdown = serializeMarkdown({ ...skill, name: slug });
        const exists = await deps.files.exists(relativePath);
        await deps.files.write(relativePath, markdown);
        return text(`${exists ? 'Updated' : 'Created'} ${relativePath}.${problems.length ? `\nWarnings:\n${problems.map((problem) => `- ${problem.message}`).join('\n')}` : ''}`);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  );

  server.registerTool(
    'start_run',
    {
      title: 'Start run',
      description: 'Starts a guided run of a skill and returns the first step to perform. Follow the step, then call next_step with the outcome. Code steps run in the sandbox automatically.',
      inputSchema: { skill: z.string(), input: z.unknown().optional() },
    },
    async ({ skill, input }) => {
      try {
        const run = await deps.runs.start(skill, input ?? null);
        return text(renderRun(run));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  );

  server.registerTool(
    'next_step',
    {
      title: 'Next step',
      description:
        'Reports the outcome of the current step and returns the next one. status is "ok" or "fail"; output is what the step produced (text or JSON); choose picks a branch ("yes"/"no", a switch case, "each"/"done").',
      inputSchema: {
        run_id: z.string(),
        status: z.enum(['ok', 'fail']).default('ok'),
        output: z.unknown().optional(),
        choose: z.string().optional(),
        message: z.string().optional(),
      },
    },
    async ({ run_id, status, output, choose, message }) => {
      try {
        const event: StepEvent = { status };
        if (output !== undefined) event.output = output;
        if (choose !== undefined) event.choose = choose;
        if (message !== undefined) event.message = message;
        const run = await deps.runs.next(run_id, event);
        return text(renderRun(run));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  );

  server.registerTool(
    'get_run',
    {
      title: 'Get run',
      description: 'Returns the full trace of a run: every step taken, its status, output and branch, plus code results.',
      inputSchema: { run_id: z.string() },
    },
    async ({ run_id }) => {
      try {
        return text(JSON.stringify(deps.runs.view(deps.runs.get(run_id)), null, 2));
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  );

  server.registerTool(
    'run_code',
    {
      title: 'Run code',
      description: 'Runs a small Python (default) or JavaScript script in the sandbox. The script receives `input` as JSON on stdin. Standard library only; 10 s and 256 MB by default.',
      inputSchema: { language: z.enum(['python', 'javascript']).default('python'), code: z.string(), input: z.unknown().optional(), timeout_seconds: z.number().optional() },
    },
    async ({ language, code, input, timeout_seconds }) => {
      const request: SandboxRequest = { language, code, input: input ?? null };
      if (timeout_seconds !== undefined) request.timeoutSeconds = timeout_seconds;
      const result = await deps.sandbox(request);
      const head = result.timedOut ? `Timed out after ${result.limits.timeoutSeconds}s.` : `Exit ${result.exitStatus} in ${result.durationMs}ms.`;
      const body = [head, result.stdout && `stdout:\n${result.stdout}`, result.stderr && `stderr:\n${result.stderr}`].filter(Boolean).join('\n');
      return result.exitStatus === 0 && !result.timedOut ? text(body) : failure(body);
    },
  );

  return server;
}

export function renderRun(run: RunView): string {
  const header = `run_id: ${run.id} · skill: ${run.skillName} · status: ${run.status}`;
  if (run.status === 'done') return `${header}\n\nThe skill is complete.\nResult: ${stringify(run.result)}`;
  if (run.status === 'failed') return `${header}\n\nThe skill stopped: ${run.error}`;
  if (!run.step) return header;
  const lastCode = run.codeResults.length ? run.codeResults[run.codeResults.length - 1] : undefined;
  const codeNote = lastCode && run.steps[run.steps.length - 1]?.type === 'code' ? `\n(Code step ${lastCode.nodeId} ran: exit ${lastCode.result.exitStatus}, output ${stringify(lastCode.result.output).slice(0, 300)})\n` : '';
  const sub = run.subSkillMarkdown ? `\n\n--- sub-skill "${run.step.subSkill}" ---\n${run.subSkillMarkdown}` : '';
  return `${header}${codeNote}\n\n${describeStep(run.step)}${sub}\n\nWhen done, call next_step with run_id "${run.id}".`;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
