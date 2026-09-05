/**
 * The workspace tree, the trash, and opening/saving files. Talks to whichever
 * backend was chosen at startup (local server, this browser, or a linked
 * folder) and hands loaded skills to the skill store. Parsing and serializing
 * happen here, through core, so every backend only deals in Markdown text.
 */
import { create } from 'zustand';
import { createEmptySkill, importText, serializeMarkdown, slugify, toJson, type Skill } from '@agent-skiller/core';
import { useSkillStore } from './skillStore.js';
import {
  browserBackend,
  detectBackend,
  linkFolder,
  reconnectFolder,
  unlinkFolder,
  writeStoragePreference,
  ServerBackend,
  type BackendInfo,
  type TrashEntry,
  type TreeEntry,
  type WorkspaceBackend,
} from '../storage/index.js';
import { BrowserBackend } from '../storage/browserBackend.js';

const LAST_PATH_KEY = 'skiller.lastPath';
const EXPANDED_KEY = 'skiller.expanded';

export interface Bundle {
  format: 'agent-skiller/bundle/1';
  exportedAt: string;
  files: { path: string; markdown: string }[];
}

export interface WorkspaceStore {
  backend: WorkspaceBackend | null;
  info: BackendInfo | null;
  serverAvailable: boolean;
  folderNeedsPermission: boolean;
  tree: TreeEntry[];
  trash: TrashEntry[];
  expanded: Record<string, boolean>;
  online: boolean;
  /** Kept for older callers; the backend's location. */
  workspaceDir: string;
  clipboard: { path: string; cut: boolean } | null;

  boot: () => Promise<void>;
  useBackend: (backend: WorkspaceBackend) => Promise<void>;
  switchToBrowser: () => Promise<void>;
  switchToServer: () => Promise<void>;
  linkFolder: () => Promise<void>;
  reconnectFolder: () => Promise<boolean>;
  unlinkFolder: () => Promise<void>;

  refresh: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  saveNow: () => Promise<void>;
  createSkill: (folder?: string, name?: string, skill?: Skill) => Promise<string>;
  createFolder: (parent: string, name: string) => Promise<void>;
  duplicate: (path: string) => Promise<void>;
  move: (from: string, toFolder: string) => Promise<void>;
  rename: (path: string, newName: string) => Promise<void>;
  renameFolder: (path: string, newName: string) => Promise<void>;
  trashFile: (path: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  deleteForever: (id: string) => Promise<void>;
  importFiles: (files: { name: string; text: string }[], folder?: string) => Promise<string[]>;
  exportAll: () => Promise<Bundle>;
  importBundle: (bundle: Bundle) => Promise<number>;
  copyFile: (path: string, cut?: boolean) => void;
  pasteInto: (folder: string) => Promise<void>;
  toggleExpanded: (path: string) => void;
  checkDisk: () => Promise<void>;
}

function readExpanded(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

function remember(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; the app still works.
  }
}

async function readSkillFile(backend: WorkspaceBackend, path: string): Promise<{ skill: Skill; mtime: number }> {
  const { markdown, mtime } = await backend.read(path);
  return { skill: importText(markdown, path).skill, mtime };
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  backend: null,
  info: null,
  serverAvailable: false,
  folderNeedsPermission: false,
  tree: [],
  trash: [],
  expanded: readExpanded(),
  online: true,
  workspaceDir: '',
  clipboard: null,

  boot: async () => {
    const detected = await detectBackend();
    set({ serverAvailable: detected.serverAvailable, folderNeedsPermission: detected.folderNeedsPermission });
    await get().useBackend(detected.backend);
  },

  useBackend: async (backend) => {
    const open = useSkillStore.getState();
    if (open.dirty) await get().saveNow().catch(() => undefined);
    useSkillStore.getState().close();
    set({ backend, info: backend.info, workspaceDir: backend.info.location, tree: [], trash: [] });
    await get().refresh();
  },

  switchToBrowser: async () => {
    writeStoragePreference('browser');
    await get().useBackend(await browserBackend());
  },

  switchToServer: async () => {
    writeStoragePreference(null);
    const detected = await detectBackend();
    set({ serverAvailable: detected.serverAvailable });
    await get().useBackend(detected.backend);
  },

  linkFolder: async () => {
    const backend = await linkFolder();
    set({ folderNeedsPermission: false });
    await get().useBackend(backend);
  },

  reconnectFolder: async () => {
    const backend = await reconnectFolder();
    if (!backend) return false;
    set({ folderNeedsPermission: false });
    await get().useBackend(backend);
    return true;
  },

  unlinkFolder: async () => {
    await unlinkFolder();
    set({ folderNeedsPermission: false });
    await get().switchToBrowser();
  },

  refresh: async () => {
    const backend = get().backend;
    if (!backend) return;
    try {
      const [tree, trash] = await Promise.all([backend.tree(), backend.listTrash()]);
      set({ tree, trash, online: true });
    } catch {
      set({ online: false });
    }
  },

  openFile: async (path) => {
    const backend = get().backend;
    if (!backend) return;
    if (useSkillStore.getState().dirty) await get().saveNow();
    const { skill, mtime } = await readSkillFile(backend, path);
    useSkillStore.getState().load(path, skill, mtime);
    remember(LAST_PATH_KEY, path);
  },

  saveNow: async () => {
    const backend = get().backend;
    const store = useSkillStore.getState();
    if (!backend || !store.path || !store.skill || !store.dirty || store.saving) return;
    store.setSaving(true);
    try {
      const { mtime } = await backend.write(store.path, serializeMarkdown(store.skill));
      useSkillStore.getState().markSaved(mtime);
    } catch (error) {
      useSkillStore.getState().setSaving(false);
      throw error;
    }
  },

  createSkill: async (folder = '', name = 'new-skill', skill) => {
    const backend = get().backend;
    if (!backend) throw new Error('Storage is not ready yet.');
    const slug = slugify(name);
    const relativePath = `${folder ? `${folder.replace(/\/+$/, '')}/` : ''}${slug}.md`;
    const draft = skill ?? createEmptySkill(slug);
    const created = await backend.create(relativePath, serializeMarkdown({ ...draft, name: slug }));
    // The file may have been renamed to stay unique; keep the frontmatter in step.
    const finalName = created.path.split('/').pop()!.replace(/\.md$/, '');
    if (finalName !== slug) await backend.write(created.path, serializeMarkdown({ ...draft, name: finalName }));
    await get().refresh();
    await get().openFile(created.path);
    return created.path;
  },

  createFolder: async (parent, name) => {
    const backend = get().backend;
    if (!backend) return;
    const path = `${parent ? `${parent}/` : ''}${name.trim().replace(/[\\/]+/g, '-')}`;
    await backend.mkdir(path);
    set({ expanded: { ...get().expanded, [parent]: true } });
    await get().refresh();
  },

  duplicate: async (path) => {
    const backend = get().backend;
    if (!backend) return;
    const copy = await backend.duplicate(path);
    await get().refresh();
    await get().openFile(copy.path);
  },

  move: async (from, toFolder) => {
    const backend = get().backend;
    if (!backend) return;
    const base = from.split('/').pop()!;
    const to = toFolder ? `${toFolder}/${base}` : base;
    if (to === from) return;
    const wasOpen = useSkillStore.getState().path === from;
    if (wasOpen) await get().saveNow();
    const moved = await backend.move(from, to);
    await get().refresh();
    if (wasOpen) await get().openFile(moved.path);
  },

  rename: async (path, newName) => {
    const backend = get().backend;
    if (!backend) return;
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const ext = path.toLowerCase().endsWith('.json') ? '.json' : '.md';
    const slug = slugify(newName);
    const to = `${folder ? `${folder}/` : ''}${slug}${ext}`;
    const wasOpen = useSkillStore.getState().path === path;
    if (wasOpen) {
      const store = useSkillStore.getState();
      if (store.skill) store.setMeta({ name: slug, title: store.skill.title === '' ? slug : store.skill.title });
      await get().saveNow();
    }
    const moved = await backend.move(path, to);
    await get().refresh();
    if (wasOpen) await get().openFile(moved.path);
  },

  renameFolder: async (path, newName) => {
    const backend = get().backend;
    if (!backend) return;
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const clean = newName.trim().replace(/[\\/]+/g, '-');
    if (!clean) return;
    const to = parent ? `${parent}/${clean}` : clean;
    if (to === path) return;
    const openPath = useSkillStore.getState().path;
    const moved = await backend.move(path, to);
    await get().refresh();
    if (openPath?.startsWith(`${path}/`)) await get().openFile(openPath.replace(`${path}/`, `${moved.path}/`)).catch(() => undefined);
  },

  trashFile: async (path) => {
    const backend = get().backend;
    if (!backend) return;
    const wasOpen = useSkillStore.getState().path === path;
    await backend.trash(path);
    if (wasOpen) {
      useSkillStore.getState().close();
      remember(LAST_PATH_KEY, null);
    }
    await get().refresh();
  },

  restore: async (id) => {
    const backend = get().backend;
    if (!backend) return;
    const restored = await backend.restore(id);
    await get().refresh();
    await get().openFile(restored.path);
  },

  deleteForever: async (id) => {
    const backend = get().backend;
    if (!backend) return;
    await backend.deleteForever(id);
    await get().refresh();
  },

  importFiles: async (files, folder = '') => {
    const backend = get().backend;
    if (!backend) return [];
    const opened: string[] = [];
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.json')) {
        // A bundle from Export all brings every file back; a single JSON skill imports on its own.
        try {
          const parsed = JSON.parse(file.text) as Partial<Bundle>;
          if (parsed.format === 'agent-skiller/bundle/1' && Array.isArray(parsed.files)) {
            await get().importBundle(parsed as Bundle);
            continue;
          }
        } catch {
          // Not JSON at all; importText will say so.
        }
      }
      const imported = importText(file.text, file.name);
      const name = imported.skill.name || slugify(file.name.replace(/\.(md|json)$/i, ''));
      const created = await backend.create(`${folder ? `${folder}/` : ''}${name}.md`, serializeMarkdown(imported.skill));
      opened.push(created.path);
    }
    await get().refresh();
    const last = opened[opened.length - 1];
    if (last) await get().openFile(last);
    return opened;
  },

  exportAll: async () => {
    const backend = get().backend;
    if (!backend) throw new Error('Storage is not ready yet.');
    await get().saveNow().catch(() => undefined);
    const files: Bundle['files'] = [];
    if (backend instanceof BrowserBackend) {
      files.push(...(await backend.exportAll()));
    } else {
      const walk = async (entries: TreeEntry[]) => {
        for (const entry of entries) {
          if (entry.type === 'folder') await walk(entry.children ?? []);
          else files.push({ path: entry.path, markdown: (await backend.read(entry.path)).markdown });
        }
      };
      await walk(await backend.tree());
    }
    return { format: 'agent-skiller/bundle/1', exportedAt: new Date().toISOString(), files };
  },

  importBundle: async (bundle) => {
    const backend = get().backend;
    if (!backend) return 0;
    let count = 0;
    for (const file of bundle.files) {
      if (typeof file.path !== 'string' || typeof file.markdown !== 'string') continue;
      await backend.create(file.path, file.markdown);
      count += 1;
    }
    await get().refresh();
    return count;
  },

  copyFile: (path, cut = false) => set({ clipboard: { path, cut } }),

  pasteInto: async (folder) => {
    const backend = get().backend;
    const clip = get().clipboard;
    if (!backend || !clip) return;
    if (clip.cut) {
      await get().move(clip.path, folder);
      set({ clipboard: null });
      return;
    }
    const copy = await backend.duplicate(clip.path);
    const base = copy.path.split('/').pop()!;
    const moved = await backend.move(copy.path, folder ? `${folder}/${base}` : base);
    await get().refresh();
    await get().openFile(moved.path);
  },

  toggleExpanded: (path) => {
    const expanded = { ...get().expanded, [path]: !get().expanded[path] };
    set({ expanded });
    remember(EXPANDED_KEY, JSON.stringify(expanded));
  },

  /** Notices files changed by another program (VS Code, an agent, git). Meaningful for server and folder modes. */
  checkDisk: async () => {
    const backend = get().backend;
    const store = useSkillStore.getState();
    if (!backend || !store.path || backend.info.kind === 'browser') return;
    try {
      const { skill, mtime } = await readSkillFile(backend, store.path);
      if (Math.abs(mtime - store.mtime) < 1) return;
      if (store.dirty || store.saving) {
        useSkillStore.getState().setDiskChanged(true);
        return;
      }
      useSkillStore.getState().load(store.path, skill, mtime);
    } catch {
      // The file may have been moved away; the tree refresh will show it.
    }
  },
}));

export function lastOpenedPath(): string | null {
  try {
    return localStorage.getItem(LAST_PATH_KEY);
  } catch {
    return null;
  }
}

export function exportText(skill: Skill, format: 'md' | 'json'): string {
  return format === 'md' ? serializeMarkdown(skill) : toJson(skill);
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: filename.endsWith('.json') ? 'application/json' : 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { ServerBackend };
