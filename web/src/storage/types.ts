/**
 * Where skills live. Three backends implement this: the local server (files
 * on its disk), this browser (IndexedDB), and a linked folder (the File
 * System Access API). The store above only ever speaks this interface, and
 * every backend deals in Markdown text; parsing is the caller's job via core.
 */
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

export type BackendKind = 'server' | 'browser' | 'folder';

export interface BackendInfo {
  kind: BackendKind;
  /** Short label for the UI: "Local server", "This browser", "Folder: Skills". */
  label: string;
  /** Where the bytes are: a path, "IndexedDB", or the folder name. */
  location: string;
  /** Whether Code steps can execute and agents can connect. */
  hasServer: boolean;
}

export interface WorkspaceBackend {
  readonly info: BackendInfo;
  tree(): Promise<TreeEntry[]>;
  read(path: string): Promise<{ markdown: string; mtime: number }>;
  write(path: string, markdown: string): Promise<{ mtime: number }>;
  /** Creates at a unique path derived from the one given. */
  create(path: string, markdown: string): Promise<{ path: string; mtime: number }>;
  mkdir(path: string): Promise<void>;
  /** Removes a folder and anything still inside it. Files are trashed first by the caller. */
  rmdir(path: string): Promise<void>;
  move(from: string, to: string): Promise<{ path: string }>;
  duplicate(path: string): Promise<{ path: string }>;
  trash(path: string): Promise<TrashEntry>;
  listTrash(): Promise<TrashEntry[]>;
  restore(id: string): Promise<{ path: string }>;
  deleteForever(id: string): Promise<void>;
  /** Cheap liveness probe; false means saves would fail. */
  ping(): Promise<boolean>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Shared path helpers, so every backend agrees on names. */
export const paths = {
  normalize(path: string): string {
    const cleaned = path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    if (cleaned.split('/').some((segment) => segment === '..')) throw new StorageError('Path may not leave the workspace.');
    if (cleaned.split('/').some((segment) => segment.startsWith('.'))) throw new StorageError('Dot-folders are internal.');
    return cleaned;
  },
  parent(path: string): string {
    return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  },
  base(path: string): string {
    return path.split('/').pop() ?? path;
  },
  split(path: string): { dir: string; name: string; ext: string } {
    const base = paths.base(path);
    const dot = base.lastIndexOf('.');
    const ext = dot > 0 ? base.slice(dot) : '';
    return { dir: paths.parent(path), name: dot > 0 ? base.slice(0, dot) : base, ext };
  },
  join(dir: string, base: string): string {
    return dir ? `${dir}/${base}` : base;
  },
  isSkillFile(name: string): boolean {
    return /\.(md|json)$/i.test(name);
  },
  /** "a/b.md" → "a/b.md", "a/b 2.md", "a/b 3.md" … until `exists` says no. */
  async unique(path: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
    const { dir, name, ext } = paths.split(path);
    let candidate = path;
    let counter = 2;
    while (await exists(candidate)) {
      candidate = paths.join(dir, `${name} ${counter}${ext}`);
      counter += 1;
    }
    return candidate;
  },
  /** "a copy.md" beside the original. */
  copyName(path: string): string {
    const { dir, name, ext } = paths.split(path);
    return paths.join(dir, `${name} copy${ext}`);
  },
  /** Sorted, folders first, as the server does. */
  sortTree(entries: TreeEntry[]): TreeEntry[] {
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
    for (const entry of entries) if (entry.children) paths.sortTree(entry.children);
    return entries;
  },
  newId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  },
};

/** Keeps the frontmatter name in step with a file's new name, as the server's duplicate does. */
export function renameInFrontmatter(markdown: string, newName: string): string {
  return markdown.replace(/^(---\n(?:.*\n)*?name:\s*)(.*)$/m, (_match, head: string) => `${head}${newName}`);
}
