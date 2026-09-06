/**
 * Skills kept in this browser. Every file is one key; folders are keys too,
 * so an empty folder survives. Nothing here leaves the machine.
 *
 *   file:<path>     {"markdown": "...", "mtime": 1700000000000}
 *   folder:<path>   "1"
 *   trash:<id>      {"originalPath": "...", "trashedAt": ..., "markdown": "..."}
 */
import type { KeyValueStore } from './kv.js';
import { StorageError, paths, renameInFrontmatter, type BackendInfo, type TrashEntry, type TreeEntry, type WorkspaceBackend } from './types.js';

interface StoredFile {
  markdown: string;
  mtime: number;
}

interface StoredTrash extends TrashEntry {
  markdown: string;
}

export class BrowserBackend implements WorkspaceBackend {
  readonly info: BackendInfo = { kind: 'browser', label: 'This browser', location: 'IndexedDB in this browser profile', hasServer: false };

  constructor(private readonly kv: KeyValueStore) {}

  async ping(): Promise<boolean> {
    return true;
  }

  private async file(path: string): Promise<StoredFile | undefined> {
    const raw = await this.kv.get(`file:${path}`);
    return raw ? (JSON.parse(raw) as StoredFile) : undefined;
  }

  private async exists(path: string): Promise<boolean> {
    return (await this.kv.get(`file:${path}`)) !== undefined || (await this.kv.get(`folder:${path}`)) !== undefined;
  }

  async tree(): Promise<TreeEntry[]> {
    const root: TreeEntry[] = [];
    const folders = new Map<string, TreeEntry>();
    const folderFor = (path: string): TreeEntry[] => {
      if (!path) return root;
      let entry = folders.get(path);
      if (!entry) {
        entry = { type: 'folder', name: paths.base(path), path, mtime: 0, children: [] };
        folders.set(path, entry);
        folderFor(paths.parent(path)).push(entry);
      }
      return entry.children!;
    };
    for (const key of await this.kv.keys('folder:')) folderFor(key.slice('folder:'.length));
    for (const key of await this.kv.keys('file:')) {
      const path = key.slice('file:'.length);
      const stored = await this.file(path);
      if (!stored) continue;
      folderFor(paths.parent(path)).push({ type: 'file', name: paths.base(path), path, mtime: stored.mtime });
    }
    return paths.sortTree(root);
  }

  async read(path: string): Promise<{ markdown: string; mtime: number }> {
    const stored = await this.file(paths.normalize(path));
    if (!stored) throw new StorageError(`No file at ${path}.`, 404);
    return stored;
  }

  async write(path: string, markdown: string): Promise<{ mtime: number }> {
    const clean = paths.normalize(path);
    const mtime = Date.now();
    await this.ensureFolders(paths.parent(clean));
    await this.kv.set(`file:${clean}`, JSON.stringify({ markdown, mtime } satisfies StoredFile));
    return { mtime };
  }

  async create(path: string, markdown: string): Promise<{ path: string; mtime: number }> {
    const unique = await paths.unique(paths.normalize(path), (candidate) => this.exists(candidate));
    const { mtime } = await this.write(unique, markdown);
    return { path: unique, mtime };
  }

  async mkdir(path: string): Promise<void> {
    await this.ensureFolders(paths.normalize(path));
  }

  private async ensureFolders(path: string): Promise<void> {
    let current = '';
    for (const segment of path.split('/').filter(Boolean)) {
      current = paths.join(current, segment);
      await this.kv.set(`folder:${current}`, '1');
    }
  }

  async rmdir(path: string): Promise<void> {
    const folder = paths.normalize(path);
    if (!folder) throw new StorageError('The workspace root cannot be deleted.');
    if ((await this.kv.get(`folder:${folder}`)) === undefined) throw new StorageError(`No folder at ${path}.`, 404);
    for (const prefix of [`file:${folder}/`, `folder:${folder}/`]) {
      for (const key of await this.kv.keys(prefix)) await this.kv.delete(key);
    }
    await this.kv.delete(`folder:${folder}`);
  }

  async move(from: string, to: string): Promise<{ path: string }> {
    const source = paths.normalize(from);
    const isFolder = (await this.kv.get(`folder:${source}`)) !== undefined;
    if (isFolder) return this.moveFolder(source, paths.normalize(to));
    const stored = await this.file(source);
    if (!stored) throw new StorageError(`No file at ${from}.`, 404);
    const target = await paths.unique(paths.normalize(to), (candidate) => this.exists(candidate));
    await this.ensureFolders(paths.parent(target));
    await this.kv.set(`file:${target}`, JSON.stringify(stored));
    await this.kv.delete(`file:${source}`);
    return { path: target };
  }

  private async moveFolder(source: string, to: string): Promise<{ path: string }> {
    if (to === source || to.startsWith(`${source}/`)) throw new StorageError('A folder cannot be moved into itself.');
    const target = await paths.unique(to, (candidate) => this.exists(candidate));
    const prefixes = [`file:${source}/`, `folder:${source}/`];
    for (const prefix of prefixes) {
      for (const key of await this.kv.keys(prefix)) {
        const value = await this.kv.get(key);
        if (value === undefined) continue;
        await this.kv.set(key.replace(`${source}/`, `${target}/`), value);
        await this.kv.delete(key);
      }
    }
    await this.kv.delete(`folder:${source}`);
    await this.ensureFolders(target);
    return { path: target };
  }

  async duplicate(path: string): Promise<{ path: string }> {
    const source = paths.normalize(path);
    const stored = await this.file(source);
    if (!stored) throw new StorageError(`No file at ${path}.`, 404);
    const target = await paths.unique(paths.copyName(source), (candidate) => this.exists(candidate));
    const markdown = target.endsWith('.md') ? renameInFrontmatter(stored.markdown, paths.split(target).name) : stored.markdown;
    await this.write(target, markdown);
    return { path: target };
  }

  async trash(path: string): Promise<TrashEntry> {
    const source = paths.normalize(path);
    const stored = await this.file(source);
    if (!stored) throw new StorageError(`No file at ${path}.`, 404);
    const entry: StoredTrash = { id: paths.newId(), originalPath: source, trashedAt: Date.now(), markdown: stored.markdown };
    await this.kv.set(`trash:${entry.id}`, JSON.stringify(entry));
    await this.kv.delete(`file:${source}`);
    const { markdown: _markdown, ...view } = entry;
    return view;
  }

  async listTrash(): Promise<TrashEntry[]> {
    const entries: TrashEntry[] = [];
    for (const key of await this.kv.keys('trash:')) {
      const raw = await this.kv.get(key);
      if (!raw) continue;
      const { markdown: _markdown, ...view } = JSON.parse(raw) as StoredTrash;
      entries.push(view);
    }
    return entries.sort((a, b) => b.trashedAt - a.trashedAt);
  }

  async restore(id: string): Promise<{ path: string }> {
    const raw = await this.kv.get(`trash:${id}`);
    if (!raw) throw new StorageError('Nothing in the trash with that id.', 404);
    const entry = JSON.parse(raw) as StoredTrash;
    const target = await paths.unique(entry.originalPath, (candidate) => this.exists(candidate));
    await this.write(target, entry.markdown);
    await this.kv.delete(`trash:${id}`);
    return { path: target };
  }

  async deleteForever(id: string): Promise<void> {
    await this.kv.delete(`trash:${id}`);
  }

  /** Everything, for a backup or a move to another machine. */
  async exportAll(): Promise<{ path: string; markdown: string }[]> {
    const files: { path: string; markdown: string }[] = [];
    for (const key of await this.kv.keys('file:')) {
      const stored = await this.file(key.slice('file:'.length));
      if (stored) files.push({ path: key.slice('file:'.length), markdown: stored.markdown });
    }
    return files;
  }
}
