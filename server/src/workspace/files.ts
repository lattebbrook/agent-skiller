/**
 * The workspace is a folder of .md skills. This is the only module that
 * touches it. Every path is relative, posix-style, and validated against
 * escaping the folder. Dot-folders (.trash, .runs) are internal.
 */
import { promises as fs } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';
import { importText, parseMarkdown, type Skill } from '@agent-skiller/core';

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

export interface SkillSummary {
  path: string;
  name: string;
  title: string;
  description: string;
  tags: string[];
}

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

export class FileStore {
  private readonly trashDir: string;

  constructor(readonly root: string) {
    this.trashDir = join(root, '.trash');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(this.trashDir, { recursive: true });
  }

  /** Relative posix path → absolute path inside the root, or throws. */
  resolve(relativePath: string, allowInternal = false): string {
    const cleaned = posix.normalize(relativePath.replace(/\\/g, '/')).replace(/^\/+/, '');
    if (cleaned === '.' || cleaned === '') return this.root;
    const segments = cleaned.split('/');
    if (segments.some((segment) => segment === '..')) throw new WorkspaceError('Path may not leave the workspace.');
    if (!allowInternal && segments.some((segment) => segment.startsWith('.'))) throw new WorkspaceError('Dot-folders are internal.');
    const absolute = resolve(this.root, ...segments);
    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) throw new WorkspaceError('Path may not leave the workspace.');
    return absolute;
  }

  async tree(): Promise<TreeEntry[]> {
    return this.readFolder('');
  }

  private async readFolder(relativePath: string): Promise<TreeEntry[]> {
    const absolute = this.resolve(relativePath);
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    const result: TreeEntry[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const childPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const stat = await fs.stat(join(absolute, entry.name));
      if (entry.isDirectory()) {
        result.push({ type: 'folder', name: entry.name, path: childPath, mtime: stat.mtimeMs, children: await this.readFolder(childPath) });
      } else if (entry.isFile() && /\.(md|json)$/i.test(entry.name)) {
        result.push({ type: 'file', name: entry.name, path: childPath, mtime: stat.mtimeMs });
      }
    }
    result.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
    return result;
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.stat(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async read(relativePath: string): Promise<{ text: string; mtime: number }> {
    const absolute = this.resolve(relativePath);
    try {
      const [text, stat] = await Promise.all([fs.readFile(absolute, 'utf8'), fs.stat(absolute)]);
      return { text, mtime: stat.mtimeMs };
    } catch {
      throw new WorkspaceError(`No file at ${relativePath}.`, 404);
    }
  }

  async write(relativePath: string, text: string): Promise<{ mtime: number }> {
    const absolute = this.resolve(relativePath);
    await fs.mkdir(resolve(absolute, '..'), { recursive: true });
    await fs.writeFile(absolute, text, 'utf8');
    const stat = await fs.stat(absolute);
    return { mtime: stat.mtimeMs };
  }

  async create(relativePath: string, text: string): Promise<{ path: string; mtime: number }> {
    const unique = await this.uniquePath(relativePath);
    const { mtime } = await this.write(unique, text);
    return { path: unique, mtime };
  }

  async mkdir(relativePath: string): Promise<void> {
    await fs.mkdir(this.resolve(relativePath), { recursive: true });
  }

  async move(from: string, to: string): Promise<{ path: string }> {
    const source = this.resolve(from);
    if (!(await this.exists(from))) throw new WorkspaceError(`No file at ${from}.`, 404);
    const target = await this.uniquePath(to);
    const destination = this.resolve(target);
    await fs.mkdir(resolve(destination, '..'), { recursive: true });
    await fs.rename(source, destination);
    return { path: target };
  }

  async duplicate(relativePath: string): Promise<{ path: string }> {
    const { text } = await this.read(relativePath);
    const parsed = posix.parse(relativePath);
    const copyPath = posix.join(parsed.dir, `${parsed.name} copy${parsed.ext}`);
    const unique = await this.uniquePath(copyPath);
    // Keep the frontmatter name in step with the file name so lookups stay unambiguous.
    const renamed = parsed.ext === '.md' ? text.replace(/^(---\n(?:.*\n)*?name:\s*)(.*)$/m, (_m, head: string) => `${head}${posix.parse(unique).name}`) : text;
    await this.write(unique, renamed);
    return { path: unique };
  }

  async trash(relativePath: string): Promise<TrashEntry> {
    const source = this.resolve(relativePath);
    if (!(await this.exists(relativePath))) throw new WorkspaceError(`No file at ${relativePath}.`, 404);
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: TrashEntry = { id, originalPath: relativePath, trashedAt: Date.now() };
    const bucket = join(this.trashDir, id);
    await fs.mkdir(bucket, { recursive: true });
    await fs.rename(source, join(bucket, posix.basename(relativePath)));
    await fs.writeFile(join(bucket, 'meta.json'), JSON.stringify(entry), 'utf8');
    return entry;
  }

  async listTrash(): Promise<TrashEntry[]> {
    const ids = await fs.readdir(this.trashDir).catch(() => [] as string[]);
    const entries: TrashEntry[] = [];
    for (const id of ids) {
      try {
        entries.push(JSON.parse(await fs.readFile(join(this.trashDir, id, 'meta.json'), 'utf8')) as TrashEntry);
      } catch {
        // A bucket without meta is not restorable; skip it.
      }
    }
    return entries.sort((a, b) => b.trashedAt - a.trashedAt);
  }

  async restore(id: string): Promise<{ path: string }> {
    const entry = (await this.listTrash()).find((candidate) => candidate.id === id);
    if (!entry) throw new WorkspaceError('Nothing in the trash with that id.', 404);
    const target = await this.uniquePath(entry.originalPath);
    const destination = this.resolve(target);
    await fs.mkdir(resolve(destination, '..'), { recursive: true });
    await fs.rename(join(this.trashDir, id, posix.basename(entry.originalPath)), destination);
    await fs.rm(join(this.trashDir, id), { recursive: true, force: true });
    return { path: target };
  }

  async deleteForever(id: string): Promise<void> {
    if (!/^[a-z0-9-]+$/.test(id)) throw new WorkspaceError('Bad trash id.');
    await fs.rm(join(this.trashDir, id), { recursive: true, force: true });
  }

  /** Every skill in the workspace with the fields an agent needs to pick one. */
  async listSkills(): Promise<SkillSummary[]> {
    const files = flatten(await this.tree()).filter((entry) => entry.type === 'file');
    const skills: SkillSummary[] = [];
    for (const file of files) {
      try {
        const { text } = await this.read(file.path);
        const { skill } = importText(text, file.path);
        skills.push({ path: file.path, name: skill.name, title: skill.title, description: skill.description, tags: skill.tags });
      } catch {
        // Unreadable file: not a skill.
      }
    }
    return skills;
  }

  /** Finds a skill by its frontmatter name, then by file name. */
  async findSkill(name: string): Promise<{ path: string; skill: Skill; text: string } | null> {
    const wanted = name.trim().toLowerCase().replace(/\.md$/, '');
    const files = flatten(await this.tree()).filter((entry) => entry.type === 'file');
    let byFileName: { path: string; skill: Skill; text: string } | null = null;
    for (const file of files) {
      const { text } = await this.read(file.path);
      const { skill } = importText(text, file.path);
      if (skill.name.toLowerCase() === wanted) return { path: file.path, skill, text };
      const pathWithoutExt = file.path.toLowerCase().replace(/\.md$/, '');
      if (!byFileName && (pathWithoutExt === wanted || posix.parse(file.path).name.toLowerCase() === wanted)) byFileName = { path: file.path, skill, text };
    }
    return byFileName;
  }

  /** "a/b.md" → "a/b.md", or "a/b 2.md", "a/b 3.md" … until free. */
  private async uniquePath(relativePath: string): Promise<string> {
    const parsed = posix.parse(relativePath);
    let candidate = relativePath;
    let counter = 2;
    while (await this.exists(candidate)) {
      candidate = posix.join(parsed.dir, `${parsed.name} ${counter}${parsed.ext}`);
      counter += 1;
    }
    return candidate;
  }
}

export function flatten(entries: TreeEntry[]): TreeEntry[] {
  return entries.flatMap((entry) => [entry, ...(entry.children ? flatten(entry.children) : [])]);
}

export function skillNameFromPath(relativePath: string): string {
  return posix.parse(relativePath).name;
}

export { parseMarkdown };
