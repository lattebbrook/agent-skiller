/**
 * The local server's disk, over its REST API. This is the mode `./run.sh`
 * gives you: files a text editor can open, Code steps that execute, and an
 * MCP endpoint for agents.
 */
import { api } from '../api.js';
import type { BackendInfo, TrashEntry, TreeEntry, WorkspaceBackend } from './types.js';

export class ServerBackend implements WorkspaceBackend {
  readonly info: BackendInfo;

  constructor(workspaceDir: string) {
    this.info = { kind: 'server', label: 'Local server', location: workspaceDir, hasServer: true };
  }

  async ping(): Promise<boolean> {
    try {
      return (await api.health()).ok;
    } catch {
      return false;
    }
  }

  async tree(): Promise<TreeEntry[]> {
    return (await api.tree()).tree;
  }

  async read(path: string): Promise<{ markdown: string; mtime: number }> {
    const file = await api.readFile(path);
    return { markdown: file.markdown, mtime: file.mtime };
  }

  async write(path: string, markdown: string): Promise<{ mtime: number }> {
    return { mtime: (await api.saveRaw(path, markdown)).mtime };
  }

  async create(path: string, markdown: string): Promise<{ path: string; mtime: number }> {
    return api.createRaw(path, markdown);
  }

  async mkdir(path: string): Promise<void> {
    await api.createFolder(path);
  }

  async rmdir(path: string): Promise<void> {
    await api.deleteFolder(path);
  }

  async move(from: string, to: string): Promise<{ path: string }> {
    return api.moveFile(from, to);
  }

  async duplicate(path: string): Promise<{ path: string }> {
    return api.duplicateFile(path);
  }

  async trash(path: string): Promise<TrashEntry> {
    return api.trashFile(path);
  }

  async listTrash(): Promise<TrashEntry[]> {
    return (await api.listTrash()).entries;
  }

  async restore(id: string): Promise<{ path: string }> {
    return api.restore(id);
  }

  async deleteForever(id: string): Promise<void> {
    await api.deleteForever(id);
  }
}
