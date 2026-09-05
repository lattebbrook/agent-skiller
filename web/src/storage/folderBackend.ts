/**
 * A folder on the person's own disk, through the File System Access API. The
 * skills are real .md files they can open in any editor; the browser only
 * keeps the folder handle, in IndexedDB, so the link survives a reload.
 * Chromium browsers only; the others fall back to BrowserBackend.
 */
import type { IndexedDbStore } from './kv.js';
import { StorageError, paths, renameInFrontmatter, type BackendInfo, type TrashEntry, type TreeEntry, type WorkspaceBackend } from './types.js';

export const FOLDER_HANDLE_KEY = 'raw:folderHandle';

type DirHandle = FileSystemDirectoryHandle;

export function folderApiAvailable(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Must run inside a user gesture (a click). */
export async function pickFolder(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandle> }).showDirectoryPicker;
  return picker({ mode: 'readwrite' });
}

type PermissionState = 'granted' | 'denied' | 'prompt';
interface Permissible {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
}

export async function folderPermission(handle: DirHandle, request = false): Promise<PermissionState> {
  const capable = handle as unknown as Permissible;
  const current = (await capable.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (current === 'granted' || !request) return current;
  return (await capable.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
}

export class FolderBackend implements WorkspaceBackend {
  readonly info: BackendInfo;

  constructor(
    private readonly root: DirHandle,
    private readonly kv: IndexedDbStore,
  ) {
    this.info = { kind: 'folder', label: `Folder: ${root.name}`, location: root.name, hasServer: false };
  }

  static async remember(kv: IndexedDbStore, handle: DirHandle): Promise<void> {
    await kv.setRaw(FOLDER_HANDLE_KEY, handle);
  }

  static async forget(kv: IndexedDbStore): Promise<void> {
    await kv.delete(FOLDER_HANDLE_KEY);
  }

  static async remembered(kv: IndexedDbStore): Promise<DirHandle | undefined> {
    return kv.getRaw<DirHandle>(FOLDER_HANDLE_KEY);
  }

  async ping(): Promise<boolean> {
    return (await folderPermission(this.root)) === 'granted';
  }

  // ---------------------------------------------------------- handles

  private async dir(path: string, create = false): Promise<DirHandle> {
    let current = this.root;
    for (const segment of path.split('/').filter(Boolean)) current = await current.getDirectoryHandle(segment, { create });
    return current;
  }

  private async fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const parent = await this.dir(paths.parent(path), create);
    return parent.getFileHandle(paths.base(path), { create });
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await this.fileHandle(path);
      return true;
    } catch {
      try {
        await this.dir(path);
        return true;
      } catch {
        return false;
      }
    }
  }

  private async writeFile(path: string, text: string): Promise<number> {
    const handle = await this.fileHandle(path, true);
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    return (await handle.getFile()).lastModified;
  }

  private async readFile(path: string): Promise<{ markdown: string; mtime: number }> {
    let handle: FileSystemFileHandle;
    try {
      handle = await this.fileHandle(path);
    } catch {
      throw new StorageError(`No file at ${path}.`, 404);
    }
    const file = await handle.getFile();
    return { markdown: await file.text(), mtime: file.lastModified };
  }

  // ------------------------------------------------------------- tree

  async tree(): Promise<TreeEntry[]> {
    return paths.sortTree(await this.readFolder(this.root, ''));
  }

  private async readFolder(handle: DirHandle, path: string): Promise<TreeEntry[]> {
    const entries: TreeEntry[] = [];
    const iterable = handle as unknown as { values(): AsyncIterable<FileSystemHandle> };
    for await (const child of iterable.values()) {
      if (child.name.startsWith('.')) continue;
      const childPath = paths.join(path, child.name);
      if (child.kind === 'directory') {
        entries.push({ type: 'folder', name: child.name, path: childPath, mtime: 0, children: await this.readFolder(child as DirHandle, childPath) });
      } else if (paths.isSkillFile(child.name)) {
        const file = await (child as FileSystemFileHandle).getFile();
        entries.push({ type: 'file', name: child.name, path: childPath, mtime: file.lastModified });
      }
    }
    return entries;
  }

  async read(path: string): Promise<{ markdown: string; mtime: number }> {
    return this.readFile(paths.normalize(path));
  }

  async write(path: string, markdown: string): Promise<{ mtime: number }> {
    return { mtime: await this.writeFile(paths.normalize(path), markdown) };
  }

  async create(path: string, markdown: string): Promise<{ path: string; mtime: number }> {
    const unique = await paths.unique(paths.normalize(path), (candidate) => this.exists(candidate));
    return { path: unique, mtime: await this.writeFile(unique, markdown) };
  }

  async mkdir(path: string): Promise<void> {
    await this.dir(paths.normalize(path), true);
  }

  async move(from: string, to: string): Promise<{ path: string }> {
    const source = paths.normalize(from);
    let isFolder = false;
    try {
      await this.fileHandle(source);
    } catch {
      isFolder = true;
    }
    const target = await paths.unique(paths.normalize(to), (candidate) => this.exists(candidate));
    if (isFolder) {
      if (target === source || target.startsWith(`${source}/`)) throw new StorageError('A folder cannot be moved into itself.');
      await this.copyFolder(await this.dir(source), target);
      await (await this.dir(paths.parent(source))).removeEntry(paths.base(source), { recursive: true });
      return { path: target };
    }
    const { markdown } = await this.readFile(source);
    await this.writeFile(target, markdown);
    await (await this.dir(paths.parent(source))).removeEntry(paths.base(source));
    return { path: target };
  }

  private async copyFolder(handle: DirHandle, targetPath: string): Promise<void> {
    await this.dir(targetPath, true);
    const iterable = handle as unknown as { values(): AsyncIterable<FileSystemHandle> };
    for await (const child of iterable.values()) {
      const childPath = paths.join(targetPath, child.name);
      if (child.kind === 'directory') await this.copyFolder(child as DirHandle, childPath);
      else await this.writeFile(childPath, await (await (child as FileSystemFileHandle).getFile()).text());
    }
  }

  async duplicate(path: string): Promise<{ path: string }> {
    const source = paths.normalize(path);
    const { markdown } = await this.readFile(source);
    const target = await paths.unique(paths.copyName(source), (candidate) => this.exists(candidate));
    await this.writeFile(target, target.endsWith('.md') ? renameInFrontmatter(markdown, paths.split(target).name) : markdown);
    return { path: target };
  }

  // ------------------------------------------------------------ trash
  // Mirrors the server: .trash/<id>/<file> plus meta.json, so the two agree.

  private async trashDir(create = false): Promise<DirHandle> {
    return this.root.getDirectoryHandle('.trash', { create });
  }

  async trash(path: string): Promise<TrashEntry> {
    const source = paths.normalize(path);
    const { markdown } = await this.readFile(source);
    const entry: TrashEntry = { id: paths.newId(), originalPath: source, trashedAt: Date.now() };
    const bucket = await (await this.trashDir(true)).getDirectoryHandle(entry.id, { create: true });
    await writeInto(bucket, paths.base(source), markdown);
    await writeInto(bucket, 'meta.json', JSON.stringify(entry));
    await (await this.dir(paths.parent(source))).removeEntry(paths.base(source));
    return entry;
  }

  async listTrash(): Promise<TrashEntry[]> {
    const entries: TrashEntry[] = [];
    let trash: DirHandle;
    try {
      trash = await this.trashDir();
    } catch {
      return entries;
    }
    const iterable = trash as unknown as { values(): AsyncIterable<FileSystemHandle> };
    for await (const bucket of iterable.values()) {
      if (bucket.kind !== 'directory') continue;
      try {
        const meta = await (await (bucket as DirHandle).getFileHandle('meta.json')).getFile();
        entries.push(JSON.parse(await meta.text()) as TrashEntry);
      } catch {
        // A bucket without meta is not restorable.
      }
    }
    return entries.sort((a, b) => b.trashedAt - a.trashedAt);
  }

  async restore(id: string): Promise<{ path: string }> {
    const entry = (await this.listTrash()).find((candidate) => candidate.id === id);
    if (!entry) throw new StorageError('Nothing in the trash with that id.', 404);
    const bucket = await (await this.trashDir()).getDirectoryHandle(id);
    const text = await (await (await bucket.getFileHandle(paths.base(entry.originalPath))).getFile()).text();
    const target = await paths.unique(entry.originalPath, (candidate) => this.exists(candidate));
    await this.writeFile(target, text);
    await (await this.trashDir()).removeEntry(id, { recursive: true });
    return { path: target };
  }

  async deleteForever(id: string): Promise<void> {
    await (await this.trashDir()).removeEntry(id, { recursive: true }).catch(() => undefined);
  }
}

async function writeInto(dir: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
