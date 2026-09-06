/**
 * Every call to the server. Thin wrappers; the shapes mirror server/src/api/routes.ts.
 */
import type { Diagnostic, Problem, RunState, Skill, StepEvent, StepView } from '@agent-skiller/core';

export interface TreeEntry {
  type: 'file' | 'folder';
  name: string;
  path: string;
  mtime: number;
  children?: TreeEntry[];
}

export interface TrashEntry {
  id: string;
  originalPath: string;
  trashedAt: number;
}

export interface FileResponse {
  path: string;
  markdown: string;
  mtime: number;
  skill: Skill;
  diagnostics: Diagnostic[];
  foreign: boolean;
  problems: Problem[];
}

export interface ImportResponse {
  skill: Skill;
  diagnostics: Diagnostic[];
  source: 'json' | 'markdown';
  foreign: boolean;
  problems: Problem[];
}

export interface SandboxResult {
  language: string;
  exitStatus: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  output: unknown;
  limits: { timeoutSeconds: number; maxMemoryMb: number };
}

export interface RunView {
  id: string;
  skillName: string;
  status: RunState['status'];
  step: StepView | null;
  subSkillMarkdown: string;
  result: unknown;
  error: string;
  steps: RunState['steps'];
  codeResults: { nodeId: number; result: SandboxResult }[];
  createdAt: number;
  updatedAt: number;
}

export interface PublicSettings {
  ai: { provider: string; baseUrl: string; model: string; apiKeySet: boolean };
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface Attachment {
  name: string;
  mimeType: string;
  data: string;
}

export interface GenerateResult {
  markdown: string;
  skill: Skill;
  problems: Problem[];
  repaired: boolean;
  model: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) throw new ApiError(typeof data['error'] === 'string' ? data['error'] : `${response.status} ${response.statusText}`, response.status);
  return data as T;
}

export const api = {
  health: () => call<{ ok: boolean; workspace: string; version: string }>('GET', '/api/health'),
  settings: () => call<PublicSettings>('GET', '/api/settings'),
  saveSettings: (patch: { ai?: Partial<{ provider: string; baseUrl: string; apiKey: string; model: string }> }) => call<PublicSettings>('PUT', '/api/settings', patch),
  aiModels: (probe: { baseUrl?: string; apiKey?: string } = {}) => call<{ models: ModelOption[] }>('POST', '/api/ai/models', probe),
  aiGenerate: (request: { prompt: string; operation: string; mode: 'skill' | 'steps'; context: string; attachments: Attachment[] }) => call<GenerateResult>('POST', '/api/ai/generate', request),
  tree: () => call<{ tree: TreeEntry[] }>('GET', '/api/tree'),
  readFile: (path: string) => call<FileResponse>('GET', `/api/files?path=${encodeURIComponent(path)}`),
  saveFile: (path: string, skill: Skill) => call<{ path: string; markdown: string; mtime: number; problems: Problem[] }>('PUT', '/api/files', { path, skill }),
  saveRaw: (path: string, markdown: string) => call<FileResponse>('PUT', '/api/files/raw', { path, markdown }),
  createFile: (name: string, folder = '', skill?: Skill) => call<{ path: string; mtime: number }>('POST', '/api/files/create', { name, folder, skill }),
  createRaw: (path: string, markdown: string) => call<{ path: string; mtime: number }>('POST', '/api/files/create', { path, markdown }),
  createFolder: (path: string) => call<{ path: string }>('POST', '/api/folders', { path }),
  deleteFolder: (path: string) => call<{ ok: boolean }>('POST', '/api/folders/delete', { path }),
  moveFile: (from: string, to: string) => call<{ path: string }>('POST', '/api/files/move', { from, to }),
  duplicateFile: (path: string) => call<{ path: string }>('POST', '/api/files/duplicate', { path }),
  trashFile: (path: string) => call<TrashEntry>('POST', '/api/files/trash', { path }),
  listTrash: () => call<{ entries: TrashEntry[] }>('GET', '/api/trash'),
  restore: (id: string) => call<{ path: string }>('POST', '/api/trash/restore', { id }),
  deleteForever: (id: string) => call<{ ok: boolean }>('DELETE', `/api/trash/${encodeURIComponent(id)}`),
  importText: (text: string, filename: string) => call<ImportResponse>('POST', '/api/import', { text, filename }),
  runCode: (language: string, code: string, input: unknown) => call<SandboxResult>('POST', '/api/run/code', { language, code, input }),
  listRuns: () => call<{ runs: RunView[] }>('GET', '/api/runs'),
  startRun: (skill: string, input: unknown) => call<RunView>('POST', '/api/runs', { skill, input }),
  nextStep: (id: string, event: StepEvent) => call<RunView>('POST', `/api/runs/${encodeURIComponent(id)}/next`, event),
};
