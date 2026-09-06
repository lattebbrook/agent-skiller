/**
 * REST used by the web editor. Thin: every handler is a file-store or
 * run-service call plus core parsing. Paths are relative to the workspace.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createEmptySkill,
  fromJson,
  importText,
  serializeMarkdown,
  slugify,
  validateSkill,
  completeLayout,
  type Skill,
} from '@agent-skiller/core';
import type { FileStore } from '../workspace/files.js';
import { WorkspaceError, skillNameFromPath } from '../workspace/files.js';
import type { RunService } from '../runs/RunService.js';
import { RunNotFound } from '../runs/RunService.js';
import type { SandboxRequest, SandboxResult } from '../sandbox/run.js';
import { ModelListFailed, listModels } from '../settings/models.js';
import { GenerationFailed, MAX_ATTACHMENT_BYTES, generateSkill, totalAttachmentBytes } from '../settings/generate.js';
import { publicSettings, type SettingsStore } from '../settings/store.js';

export interface ApiDeps {
  files: FileStore;
  runs: RunService;
  sandbox: (request: SandboxRequest) => Promise<SandboxResult>;
  settings: SettingsStore;
}

const pathSchema = z.string().min(1);

export function registerApiRoutes(app: FastifyInstance, deps: ApiDeps): void {
  const { files, runs } = deps;

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof WorkspaceError) return reply.status(error.statusCode).send({ error: error.message });
    if (error instanceof RunNotFound) return reply.status(404).send({ error: error.message });
    if (error instanceof ModelListFailed) return reply.status(error.statusCode).send({ error: error.message });
    if (error instanceof GenerationFailed) return reply.status(error.statusCode).send({ error: error.message });
    if (error instanceof z.ZodError) return reply.status(400).send({ error: error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    return reply.status(status).send({ error: (error as Error).message });
  });

  app.get('/api/health', async () => ({ ok: true, workspace: files.root, version: '0.1.0' }));

  // --------------------------------------------------------------- settings
  app.get('/api/settings', async () => publicSettings(await deps.settings.read()));

  app.put('/api/settings', async (request) => {
    const body = z
      .object({
        ai: z
          .object({ provider: z.string().optional(), baseUrl: z.string().optional(), apiKey: z.string().optional(), model: z.string().optional() })
          .optional(),
      })
      .parse(request.body);
    return publicSettings(await deps.settings.update(body));
  });

  /**
   * The model list, fetched by the server so the key stays here and the browser
   * never makes a cross-origin call. An unsaved base URL or key can be passed
   * in to try a provider before committing to it.
   */
  app.post('/api/ai/models', async (request) => {
    const body = z.object({ baseUrl: z.string().optional(), apiKey: z.string().optional() }).parse(request.body ?? {});
    const stored = await deps.settings.read();
    const models = await listModels({
      ...stored.ai,
      baseUrl: body.baseUrl ?? stored.ai.baseUrl,
      apiKey: body.apiKey !== undefined && body.apiKey !== '' ? body.apiKey : stored.ai.apiKey,
    });
    return { models };
  });

  /** Writes a skill from a description, validated against our own parser before it is returned. */
  app.post('/api/ai/generate', async (request) => {
    const body = z
      .object({
        prompt: z.string(),
        operation: z.string().default(''),
        mode: z.enum(['skill', 'steps']).default('skill'),
        context: z.string().default(''),
        attachments: z
          .array(z.object({ name: z.string(), mimeType: z.string(), data: z.string() }))
          .max(6)
          .default([]),
      })
      .parse(request.body);
    if (totalAttachmentBytes(body.attachments) > MAX_ATTACHMENT_BYTES) {
      throw new GenerationFailed(`Attachments add up to more than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`, 400);
    }
    const stored = await deps.settings.read();
    return generateSkill(stored.ai, body);
  });

  app.get('/api/tree', async () => ({ tree: await files.tree() }));

  app.get('/api/files', async (request) => {
    const { path } = z.object({ path: pathSchema }).parse(request.query);
    const { text, mtime } = await files.read(path);
    const imported = importText(text, path);
    return { path, markdown: text, mtime, skill: imported.skill, diagnostics: imported.diagnostics, foreign: imported.foreign, problems: validateSkill(imported.skill) };
  });

  app.put('/api/files', async (request) => {
    const body = z.object({ path: pathSchema, skill: z.unknown() }).parse(request.body);
    const skill = coerceSkill(body.skill);
    const markdown = serializeMarkdown(skill);
    const { mtime } = await files.write(body.path, markdown);
    return { path: body.path, markdown, mtime, problems: validateSkill(skill) };
  });

  /** Saves raw Markdown (the in-app Markdown tab) and returns it re-parsed. */
  app.put('/api/files/raw', async (request) => {
    const body = z.object({ path: pathSchema, markdown: z.string() }).parse(request.body);
    const imported = importText(body.markdown, body.path);
    const { mtime } = await files.write(body.path, body.markdown);
    return { path: body.path, markdown: body.markdown, mtime, skill: imported.skill, diagnostics: imported.diagnostics, problems: validateSkill(imported.skill) };
  });

  app.post('/api/files/create', async (request) => {
    const body = z
      .object({ folder: z.string().default(''), name: z.string().default('new-skill'), skill: z.unknown().optional(), path: z.string().optional(), markdown: z.string().optional() })
      .parse(request.body);
    // Raw form: a path and its text, kept unique. What the browser-side store uses.
    if (body.path !== undefined && body.markdown !== undefined) {
      const created = await files.create(body.path, body.markdown);
      return { path: created.path, mtime: created.mtime };
    }
    const name = slugify(body.name);
    const skill = body.skill ? coerceSkill(body.skill) : createEmptySkill(name);
    const relativePath = `${body.folder ? `${body.folder.replace(/\/+$/, '')}/` : ''}${name}.md`;
    const created = await files.create(relativePath, serializeMarkdown({ ...skill, name: skillNameFromPath(relativePath) }));
    // The file may have been renamed to stay unique; keep the frontmatter in step.
    const finalName = skillNameFromPath(created.path);
    if (finalName !== skill.name) await files.write(created.path, serializeMarkdown({ ...skill, name: finalName }));
    return { path: created.path, mtime: created.mtime };
  });

  app.post('/api/folders', async (request) => {
    const { path } = z.object({ path: pathSchema }).parse(request.body);
    await files.mkdir(path);
    return { path };
  });

  app.post('/api/folders/delete', async (request) => {
    const { path } = z.object({ path: pathSchema }).parse(request.body);
    await files.rmdir(path);
    return { ok: true };
  });

  app.post('/api/files/move', async (request) => {
    const { from, to } = z.object({ from: pathSchema, to: pathSchema }).parse(request.body);
    return files.move(from, to);
  });

  app.post('/api/files/duplicate', async (request) => {
    const { path } = z.object({ path: pathSchema }).parse(request.body);
    return files.duplicate(path);
  });

  app.post('/api/files/trash', async (request) => {
    const { path } = z.object({ path: pathSchema }).parse(request.body);
    return files.trash(path);
  });

  app.get('/api/trash', async () => ({ entries: await files.listTrash() }));

  app.post('/api/trash/restore', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.body);
    return files.restore(id);
  });

  app.delete('/api/trash/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await files.deleteForever(id);
    return { ok: true };
  });

  app.post('/api/import', async (request) => {
    const body = z.object({ text: z.string(), filename: z.string().default('') }).parse(request.body);
    const imported = importText(body.text, body.filename);
    return { ...imported, problems: validateSkill(imported.skill) };
  });

  app.post('/api/validate', async (request) => {
    const body = z.object({ skill: z.unknown() }).parse(request.body);
    const skill = coerceSkill(body.skill);
    return { problems: validateSkill(skill), markdown: serializeMarkdown(skill) };
  });

  app.post('/api/run/code', async (request) => {
    const body = z.object({ language: z.string().default('python'), code: z.string(), input: z.unknown().optional(), timeoutSeconds: z.number().optional() }).parse(request.body);
    const sandboxRequest: SandboxRequest = { language: body.language, code: body.code, input: body.input ?? null };
    if (body.timeoutSeconds !== undefined) sandboxRequest.timeoutSeconds = body.timeoutSeconds;
    return deps.sandbox(sandboxRequest);
  });

  app.get('/api/runs', async () => ({ runs: runs.list() }));

  app.get('/api/runs/:id', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return runs.view(runs.get(id));
  });

  app.post('/api/runs', async (request) => {
    const body = z.object({ skill: z.string(), input: z.unknown().optional() }).parse(request.body);
    return runs.start(body.skill, body.input ?? null);
  });

  app.post('/api/runs/:id/next', async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: z.enum(['ok', 'fail']).default('ok'), output: z.unknown().optional(), choose: z.string().optional(), message: z.string().optional() }).parse(request.body);
    return runs.next(id, {
      status: body.status,
      ...(body.output !== undefined ? { output: body.output } : {}),
      ...(body.choose !== undefined ? { choose: body.choose } : {}),
      ...(body.message !== undefined ? { message: body.message } : {}),
    });
  });
}

/** Whatever the client sent, run it through the lenient JSON reader so a stale shape cannot crash a save. */
function coerceSkill(raw: unknown): Skill {
  const { skill } = fromJson(JSON.stringify(raw));
  return { ...skill, layout: completeLayout(skill) };
}
