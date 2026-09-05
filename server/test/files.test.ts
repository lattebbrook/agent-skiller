import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileStore, WorkspaceError } from '../src/workspace/files.js';

let root: string;
let store: FileStore;

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'skiller-files-'));
  store = new FileStore(root);
  await store.init();
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const SKILL = (name: string) => `---\nname: ${name}\ndescription: d\n---\n# ${name}\n\n## 1. Start\n- next: 2\n\n## 2. End\n`;

describe('FileStore', () => {
  it('refuses paths that escape or touch dot-folders', () => {
    expect(() => store.resolve('../x.md')).toThrow(WorkspaceError);
    expect(() => store.resolve('a/../../x.md')).toThrow(WorkspaceError);
    expect(() => store.resolve('.trash/x.md')).toThrow(WorkspaceError);
    expect(store.resolve('a/b.md')).toBe(join(root, 'a', 'b.md'));
  });

  it('creates, lists and reads files in folders', async () => {
    await store.mkdir('team');
    await store.write('team/one.md', SKILL('one'));
    await store.write('two.md', SKILL('two'));
    const tree = await store.tree();
    expect(tree.map((entry) => `${entry.type}:${entry.path}`)).toEqual(['folder:team', 'file:two.md']);
    expect(tree[0]!.children!.map((entry) => entry.path)).toEqual(['team/one.md']);
    expect((await store.read('team/one.md')).text).toBe(SKILL('one'));
  });

  it('keeps created files unique', async () => {
    expect((await store.create('a.md', 'x')).path).toBe('a.md');
    expect((await store.create('a.md', 'y')).path).toBe('a 2.md');
    expect((await store.create('a.md', 'z')).path).toBe('a 3.md');
  });

  it('duplicates with a renamed frontmatter name', async () => {
    await store.write('a.md', SKILL('a'));
    const { path } = await store.duplicate('a.md');
    expect(path).toBe('a copy.md');
    expect((await store.read(path)).text).toContain('name: a copy');
  });

  it('moves files between folders', async () => {
    await store.write('a.md', 'x');
    await store.move('a.md', 'archive/a.md');
    expect(await store.exists('a.md')).toBe(false);
    expect((await store.read('archive/a.md')).text).toBe('x');
  });

  it('trashes, lists, restores and deletes forever', async () => {
    await store.write('docs/a.md', 'x');
    const entry = await store.trash('docs/a.md');
    expect(await store.exists('docs/a.md')).toBe(false);
    expect((await store.listTrash()).map((item) => item.originalPath)).toEqual(['docs/a.md']);
    const restored = await store.restore(entry.id);
    expect(restored.path).toBe('docs/a.md');
    expect((await store.read('docs/a.md')).text).toBe('x');
    const again = await store.trash('docs/a.md');
    await store.deleteForever(again.id);
    expect(await store.listTrash()).toEqual([]);
  });

  it('finds skills by frontmatter name or file name', async () => {
    await store.write('folder/mail.md', SKILL('summarize-inbox'));
    expect((await store.findSkill('summarize-inbox'))?.path).toBe('folder/mail.md');
    expect((await store.findSkill('mail'))?.path).toBe('folder/mail.md');
    expect((await store.findSkill('folder/mail.md'))?.path).toBe('folder/mail.md');
    expect(await store.findSkill('nope')).toBeNull();
    const list = await store.listSkills();
    expect(list).toEqual([{ path: 'folder/mail.md', name: 'summarize-inbox', title: 'summarize-inbox', description: 'd', tags: [] }]);
  });
});
