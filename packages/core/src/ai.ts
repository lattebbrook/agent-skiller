/**
 * Talking to an OpenAI-compatible model provider: listing models, and writing
 * a skill from a description. One implementation for both places it runs:
 *
 *   - the server, which keeps the key on disk and calls out on the page's
 *     behalf (the "local server" mode);
 *   - the browser itself, in the static build, where the key lives in the
 *     person's own localStorage and the page calls the provider directly.
 *
 * Nothing here touches a file or a DOM. The caller passes `fetch`.
 */
import { formatGuide, EXAMPLE_SKILL } from './spec.js';
import { importText } from './importer.js';
import { serializeMarkdown } from './markdown.js';
import { validateSkill, type Problem } from './validate.js';
import type { Skill } from './model.js';

export interface AiSettings {
  /** Label for the preset the user picked; free text, not authoritative. */
  provider: string;
  /** OpenAI-compatible base, e.g. https://openrouter.ai/api/v1 */
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface Attachment {
  name: string;
  /** e.g. image/png, text/plain */
  mimeType: string;
  /** Base64, without the data: prefix. */
  data: string;
}

export interface GenerateRequest {
  prompt: string;
  /** What kind of work this is, e.g. "computer use". */
  operation: string;
  attachments: Attachment[];
  /** The skill open in the editor, so the model can extend rather than restate it. */
  context: string;
  /** 'skill' writes a whole file; 'steps' adds to what is already there. */
  mode: 'skill' | 'steps';
}

export interface GenerateResult {
  markdown: string;
  skill: Skill;
  problems: Problem[];
  /** True when the first answer had errors and a repair round was needed. */
  repaired: boolean;
  model: string;
}

export class AiError extends Error {
  constructor(
    message: string,
    /** HTTP-ish status a server wrapper can pass on: 400 for a bad request, 401 for a bad key, 502 for the provider. */
    public statusCode = 502,
  ) {
    super(message);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_ATTACHMENT_CHARS = 20000;

export function totalAttachmentBytes(attachments: Attachment[]): number {
  return attachments.reduce((sum, file) => sum + Math.ceil((file.data.length * 3) / 4), 0);
}

// ------------------------------------------------------------ transport

function endpoint(ai: AiSettings, path: string): string {
  const base = ai.baseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new AiError('Set the API base URL first.', 400);
  try {
    return new URL(`${base}${path}`).toString();
  } catch {
    throw new AiError(`"${ai.baseUrl}" is not a valid URL.`, 400);
  }
}

function headersFor(ai: AiSettings, json: boolean): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (json) headers['content-type'] = 'application/json';
  if (ai.apiKey.trim()) headers['authorization'] = `Bearer ${ai.apiKey.trim()}`;
  // OpenRouter asks callers to identify themselves; harmless elsewhere.
  headers['http-referer'] = 'https://github.com/lattebbrook/agent-skiller';
  headers['x-title'] = 'AgentSkiller';
  return headers;
}

async function request(fetchImpl: FetchLike, url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const host = new URL(url).host;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    const name = (error as Error).name;
    throw new AiError(name === 'AbortError' ? `${host} did not answer within ${Math.round(timeoutMs / 1000)}s.` : `Could not reach ${host}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const body = (await response.text().catch(() => '')).slice(0, 300);
    if (response.status === 401 || response.status === 403) throw new AiError('The provider rejected the API key.', 401);
    throw new AiError(`${host} answered ${response.status}. ${body}`.trim());
  }
  return response;
}

// --------------------------------------------------------------- models

/** GET {baseUrl}/models. Works with OpenRouter, OpenAI, Ollama, LM Studio and anything shaped like them. */
export async function listModels(ai: AiSettings, fetchImpl: FetchLike, timeoutMs = 15000): Promise<ModelOption[]> {
  const url = endpoint(ai, '/models');
  const response = await request(fetchImpl, url, { headers: headersFor(ai, false) }, timeoutMs);
  const payload = (await response.json().catch(() => null)) as { data?: unknown; models?: unknown } | null;
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : null;
  if (!rows) throw new AiError(`${new URL(url).host} did not return a model list.`);
  const options: ModelOption[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const id = typeof row?.['id'] === 'string' ? row['id'] : typeof row?.['name'] === 'string' ? (row['name'] as string) : '';
    if (!id) continue;
    options.push({ id, name: typeof row['name'] === 'string' ? (row['name'] as string) : id });
  }
  options.sort((a, b) => a.id.localeCompare(b.id));
  return options;
}

// ------------------------------------------------------------- generate

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

/**
 * The model gets the format spec (generated from the catalogue, so it cannot
 * drift) and a worked example. Its answer is parsed and validated here; if it
 * has errors the model is told exactly what they were and asked once to fix
 * them. Only a file our own editor can open is ever returned.
 */
export async function generateSkill(ai: AiSettings, req: GenerateRequest, fetchImpl: FetchLike, timeoutMs = 120000): Promise<GenerateResult> {
  if (!ai.model.trim()) throw new AiError('Choose a model in Settings first.', 400);
  if (!req.prompt.trim()) throw new AiError('Say what the skill should do.', 400);
  if (totalAttachmentBytes(req.attachments) > MAX_ATTACHMENT_BYTES) throw new AiError(`Attachments add up to more than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`, 400);

  const messages: Message[] = [
    { role: 'system', content: formatGuide() },
    { role: 'system', content: `Here is a complete example of the format:\n\n${EXAMPLE_SKILL}` },
    { role: 'user', content: buildUserContent(req) },
  ];

  const first = await complete(ai, messages, fetchImpl, timeoutMs);
  const firstTry = readSkill(first);
  if (firstTry.errors.length === 0) return { ...firstTry.result, repaired: false, model: ai.model };

  messages.push({ role: 'assistant', content: first });
  messages.push({
    role: 'user',
    content: `That file does not load. The editor reported:\n${firstTry.errors.map((problem) => `- ${problem.nodeId ? `step ${problem.nodeId}: ` : ''}${problem.message}`).join('\n')}\n\nSend the corrected Markdown file, and nothing else.`,
  });
  const second = await complete(ai, messages, fetchImpl, timeoutMs);
  const secondTry = readSkill(second);
  if (secondTry.errors.length > 0) {
    throw new AiError(`The model could not produce a valid skill. Last problems:\n- ${secondTry.errors.map((problem) => problem.message).join('\n- ')}`);
  }
  return { ...secondTry.result, repaired: true, model: ai.model };
}

function decodeBase64Text(data: string): string {
  try {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

function buildUserContent(req: GenerateRequest): ContentPart[] {
  const lines: string[] = [];
  lines.push(req.mode === 'steps' ? 'Write the steps described below.' : 'Write a complete skill for the task below.');
  lines.push('');
  lines.push(`Kind of operation: ${req.operation || 'not stated'}`);
  lines.push('');
  lines.push('What it should do:');
  lines.push(req.prompt.trim());

  if (req.mode === 'steps' && req.context.trim()) {
    lines.push('');
    lines.push('It will be added to this existing skill, so do not repeat its steps and keep the same style:');
    lines.push('');
    lines.push(req.context.trim());
    lines.push('');
    lines.push('Still reply with a complete, valid file of your own; the editor renumbers your steps when it merges them.');
  }

  const images = req.attachments.filter((file) => file.mimeType.startsWith('image/'));
  const texts = req.attachments.filter((file) => !file.mimeType.startsWith('image/'));
  if (images.length) {
    lines.push('');
    lines.push(`${images.length} screenshot(s) are attached showing the screen, buttons or controls this skill must work with. Name the controls exactly as they appear in them.`);
  }
  for (const file of texts) {
    lines.push('');
    lines.push(`Attached file "${file.name}":`);
    lines.push('```');
    lines.push(decodeBase64Text(file.data).slice(0, MAX_TEXT_ATTACHMENT_CHARS));
    lines.push('```');
  }

  const parts: ContentPart[] = [{ type: 'text', text: lines.join('\n') }];
  for (const image of images) parts.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  return parts;
}

async function complete(ai: AiSettings, messages: Message[], fetchImpl: FetchLike, timeoutMs: number): Promise<string> {
  const url = endpoint(ai, '/chat/completions');
  const response = await request(fetchImpl, url, { method: 'POST', headers: headersFor(ai, true), body: JSON.stringify({ model: ai.model, messages, temperature: 0.2 }) }, timeoutMs);
  const payload = (await response.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = payload?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : Array.isArray(content) ? (content as ContentPart[]).map((part) => ('text' in part ? part.text : '')).join('') : '';
  if (!text.trim()) throw new AiError('The model returned nothing.');
  return text;
}

/** Strips any fence the model wrapped the file in, then parses and validates. */
function readSkill(answer: string): { result: Omit<GenerateResult, 'repaired' | 'model'>; errors: Problem[] } {
  const fenced = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n?```\s*$/.exec(answer.trim());
  const text = (fenced ? fenced[1]! : answer).trim();
  const imported = importText(text, 'generated.md');
  const problems = validateSkill(imported.skill);
  return {
    result: { markdown: serializeMarkdown(imported.skill), skill: imported.skill, problems },
    errors: problems.filter((problem) => problem.severity === 'error'),
  };
}
