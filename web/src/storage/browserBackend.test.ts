import { beforeEach, describe, expect, it } from 'vitest';
import { BrowserBackend } from './browserBackend.js';
import { MemoryStore } from './kv.js';
import { StorageError, paths } from './types.js';

const SKILL = (name: string) => `---\nname: ${name}\ndescription: d\n---\n# ${name}\n\n## 1. Start\n- next: 2\n\n## 2. End\n`;

let backend: BrowserBackend;
beforeEach(() => {
  backend = new BrowserBackend(new MemoryStore());
});

describe('paths', () => {
  it('refuses escapes and dot-folders, like the server', () => {
    expect(() => paths.normalize('../x.md')).toThrow(StorageError);
    expect(() => paths.normalize('.trash/x.md')).toThrow(StorageError);
    expect(paths.normalize('/a/b.md/')).toBe('a/b.md');
  });
  it('splits, joins and names copies', () => {
    expect(paths.split('a/b.md')).toEqual({ dir: 'a', name: 'b', ext: '.md' });
    expect(paths.copyName('a/b.md')).toBe('a/b copy.md');
    expect(paths.join('', 'x.md')).toBe('x.md');
  });
});

describe('BrowserBackend', () => {
  it('creates, lists and reads files in folders, folders first', async () => {
    await backend.mkdir('team');
    await backend.write('team/one.md', SKILL('one'));
    await backend.write('two.md', SKILL('two'));
    const tree = await backend.tree();
    expect(tree.map((entry) => `${entry.type}:${entry.path}`)).toEqual(['folder:team', 'file:two.md']);
    expect(tree[0]!.children!.map((entry) => entry.path)).toEqual(['team/one.md']);
    expect((await backend.read('team/one.md')).markdown).toBe(SKILL('one'));
  });

  it('keeps an empty folder', async () => {
    await backend.mkdir('empty/inner');
    const tree = await backend.tree();
    expect(tree[0]!.path).toBe('empty');
    expect(tree[0]!.children![0]!.path).toBe('empty/inner');
  });

  it('keeps created files unique', async () => {
    expect((await backend.create('a.md', 'x')).path).toBe('a.md');
    expect((await backend.create('a.md', 'y')).path).toBe('a 2.md');
    expect((await backend.create('a.md', 'z')).path).toBe('a 3.md');
  });

  it('duplicates with a renamed frontmatter name', async () => {
    await backend.write('a.md', SKILL('a'));
    const { path } = await backend.duplicate('a.md');
    expect(path).toBe('a copy.md');
    expect((await backend.read(path)).markdown).toContain('name: a copy');
  });

  it('moves files between folders and whole folders', async () => {
    await backend.write('a.md', 'x');
    await backend.move('a.md', 'archive/a.md');
    expect((await backend.read('archive/a.md')).markdown).toBe('x');
    await expect(backend.read('a.md')).rejects.toBeInstanceOf(StorageError);
    await backend.write('archive/deep/b.md', 'y');
    const moved = await backend.move('archive', 'old');
    expect(moved.path).toBe('old');
    expect((await backend.read('old/deep/b.md')).markdown).toBe('y');
    expect((await backend.tree()).map((entry) => entry.path)).toEqual(['old']);
  });

  it('refuses to move a folder into itself', async () => {
    await backend.mkdir('a');
    await expect(backend.move('a', 'a/b')).rejects.toThrow(/into itself/);
  });

  it('trashes, lists, restores and deletes forever', async () => {
    await backend.write('docs/a.md', 'x');
    const entry = await backend.trash('docs/a.md');
    await expect(backend.read('docs/a.md')).rejects.toBeInstanceOf(StorageError);
    expect((await backend.listTrash()).map((item) => item.originalPath)).toEqual(['docs/a.md']);
    expect((await backend.restore(entry.id)).path).toBe('docs/a.md');
    expect((await backend.read('docs/a.md')).markdown).toBe('x');
    const again = await backend.trash('docs/a.md');
    await backend.deleteForever(again.id);
    expect(await backend.listTrash()).toEqual([]);
  });

  it('restores beside a file that took the name meanwhile', async () => {
    await backend.write('a.md', 'old');
    const entry = await backend.trash('a.md');
    await backend.write('a.md', 'new');
    expect((await backend.restore(entry.id)).path).toBe('a 2.md');
  });

  it('exports everything', async () => {
    await backend.write('a.md', 'x');
    await backend.write('f/b.md', 'y');
    expect(await backend.exportAll()).toEqual([
      { path: 'a.md', markdown: 'x' },
      { path: 'f/b.md', markdown: 'y' },
    ]);
  });
});
