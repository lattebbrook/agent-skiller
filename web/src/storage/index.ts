/**
 * Picks where skills live, once, at startup:
 *
 *   1. the local server, when /api/health answers — the full experience;
 *   2. otherwise a folder the person linked earlier, if the browser still
 *      lets us write to it;
 *   3. otherwise this browser's IndexedDB.
 *
 * The person can override 2 and 3 from Settings. The choice is remembered.
 */
import { BrowserBackend } from './browserBackend.js';
import { FolderBackend, folderApiAvailable, folderPermission, pickFolder } from './folderBackend.js';
import { IndexedDbStore, MemoryStore, indexedDbAvailable } from './kv.js';
import { SEED_FILES } from './seed.js';
import { ServerBackend } from './serverBackend.js';
import type { BackendKind, WorkspaceBackend } from './types.js';

export * from './types.js';
export { BrowserBackend } from './browserBackend.js';
export { FolderBackend, folderApiAvailable } from './folderBackend.js';
export { ServerBackend } from './serverBackend.js';
export { MemoryStore, IndexedDbStore } from './kv.js';

const PREFERENCE_KEY = 'skiller.storage';
const SEEDED_KEY = 'skiller.seeded';

let kvSingleton: IndexedDbStore | null = null;
function kv(): IndexedDbStore {
  kvSingleton ??= new IndexedDbStore();
  return kvSingleton;
}

export function readStoragePreference(): BackendKind | null {
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY);
    return raw === 'browser' || raw === 'folder' || raw === 'server' ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoragePreference(kind: BackendKind | null): void {
  try {
    if (kind) localStorage.setItem(PREFERENCE_KEY, kind);
    else localStorage.removeItem(PREFERENCE_KEY);
  } catch {
    // ignore
  }
}

export interface Detection {
  backend: WorkspaceBackend;
  /** True when a server answered, whatever was chosen. */
  serverAvailable: boolean;
  /** True when a linked folder exists but needs a click to grant access again. */
  folderNeedsPermission: boolean;
}

async function probeServer(timeoutMs = 1500): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/api/health', { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok?: boolean; workspace?: string };
    return body.ok ? (body.workspace ?? '') : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function browserBackend(): Promise<BrowserBackend> {
  const backend = new BrowserBackend(indexedDbAvailable() ? kv() : new MemoryStore());
  await seedIfEmpty(backend);
  return backend;
}

async function seedIfEmpty(backend: BrowserBackend): Promise<void> {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
  } catch {
    // no storage: seed every time, it is idempotent enough
  }
  if ((await backend.tree()).length === 0) {
    for (const file of SEED_FILES) await backend.write(file.path, file.markdown);
  }
  try {
    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    // ignore
  }
}

export async function detectBackend(): Promise<Detection> {
  const preference = readStoragePreference();
  const workspaceDir = await probeServer();
  const serverAvailable = workspaceDir !== null;

  if (serverAvailable && preference !== 'browser' && preference !== 'folder') {
    return { backend: new ServerBackend(workspaceDir), serverAvailable, folderNeedsPermission: false };
  }

  if (preference !== 'browser' && folderApiAvailable() && indexedDbAvailable()) {
    const handle = await FolderBackend.remembered(kv()).catch(() => undefined);
    if (handle) {
      const permission = await folderPermission(handle);
      if (permission === 'granted') return { backend: new FolderBackend(handle, kv()), serverAvailable, folderNeedsPermission: false };
      if (permission === 'prompt') return { backend: await browserBackend(), serverAvailable, folderNeedsPermission: true };
    }
  }

  return { backend: await browserBackend(), serverAvailable, folderNeedsPermission: false };
}

/** Runs inside a click: asks for a folder, remembers it, and returns the backend. */
export async function linkFolder(): Promise<FolderBackend> {
  const handle = await pickFolder();
  if ((await folderPermission(handle, true)) !== 'granted') throw new Error('The browser did not grant access to that folder.');
  await FolderBackend.remember(kv(), handle);
  writeStoragePreference('folder');
  return new FolderBackend(handle, kv());
}

/** Re-asks for access to the remembered folder; also needs a click. */
export async function reconnectFolder(): Promise<FolderBackend | null> {
  const handle = await FolderBackend.remembered(kv()).catch(() => undefined);
  if (!handle) return null;
  if ((await folderPermission(handle, true)) !== 'granted') return null;
  return new FolderBackend(handle, kv());
}

export async function unlinkFolder(): Promise<void> {
  await FolderBackend.forget(kv()).catch(() => undefined);
  if (readStoragePreference() === 'folder') writeStoragePreference(null);
}
