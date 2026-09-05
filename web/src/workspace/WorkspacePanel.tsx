/**
 * The file tree: open, create, duplicate, rename, move (drag onto a folder),
 * trash and restore. Import lands here too.
 */
import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardPaste, Copy, FilePlus2, FileText, FolderClosed, FolderOpen, FolderPlus, Pencil, RotateCcw, Scissors, Search, SquarePlus, Trash2, Upload, X } from 'lucide-react';
import type { TreeEntry } from '../api.js';
import { useWorkspaceStore } from '../store/workspaceStore.js';
import { useSkillStore } from '../store/skillStore.js';
import { useToast } from '../shared/Toast.js';
import { ContextMenu, type MenuItem } from '../canvas/ContextMenu.js';

const FILE_MIME = 'application/agent-skiller-path';

export function WorkspacePanel() {
  const tree = useWorkspaceStore((state) => state.tree);
  const trash = useWorkspaceStore((state) => state.trash);
  const online = useWorkspaceStore((state) => state.online);
  const workspace = useWorkspaceStore();
  const currentPath = useSkillStore((state) => state.path);
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<{ screen: { x: number; y: number }; items: MenuItem[] } | null>(null);

  const guard = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast.show((error as Error).message, 'error');
    }
  };

  const importFromInput = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items = await Promise.all([...files].map(async (file) => ({ name: file.name, text: await file.text() })));
    await guard(() => workspace.importFiles(items));
    toast.show(`Imported ${items.length} file${items.length > 1 ? 's' : ''}.`);
  };

  const visible = useMemo(() => filterTree(tree, query.trim().toLowerCase()), [tree, query]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="toolbar">
        <div className="search flex-1">
          <Search size={13} />
          <input className="field w-full" placeholder="Filter skills" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <button className="btn icon" title="New skill" onClick={() => guard(() => workspace.createSkill('', 'new-skill'))}>
          <FilePlus2 size={15} />
        </button>
        <button
          className="btn icon"
          title="New folder"
          onClick={() => {
            const name = window.prompt('Folder name');
            if (name) void guard(() => workspace.createFolder('', name));
          }}
        >
          <FolderPlus size={15} />
        </button>
        <button className="btn icon" title="Import .md or .json" onClick={() => fileInput.current?.click()}>
          <Upload size={15} />
        </button>
        <input ref={fileInput} type="file" accept=".md,.json,.markdown,.txt" multiple hidden onChange={(event) => void importFromInput(event.target.files).then(() => (event.target.value = ''))} />
      </div>
      {!online && (
        <div className="problem-error mx-2 mb-2 px-2 py-1 rounded text-[11.5px]">The server is not reachable.</div>
      )}

      <div
        className={`tree flex-1 scroll ${rootDragOver ? 'tree-row dragover' : ''}`}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(FILE_MIME) || event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            setRootDragOver(true);
          }
        }}
        onDragLeave={() => setRootDragOver(false)}
        onDrop={(event) => {
          setRootDragOver(false);
          const path = event.dataTransfer.getData(FILE_MIME);
          if (path) {
            event.preventDefault();
            void guard(() => workspace.move(path, ''));
          } else if (event.dataTransfer.files.length) {
            event.preventDefault();
            void importFromInput(event.dataTransfer.files);
          }
        }}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('.tree-row')) return;
          event.preventDefault();
          setMenu({ screen: { x: event.clientX, y: event.clientY }, items: folderMenuItems('', workspace, guard) });
        }}
      >
        {visible.length === 0 && (
          <p className="px-2 py-4 text-[12px]" style={{ color: 'var(--muted)' }}>
            {query ? 'Nothing matches.' : 'No skills yet. Create one, or drop a .md / .json file here.'}
          </p>
        )}
        {visible.map((entry) => (
          <TreeRow key={entry.path} entry={entry} depth={0} currentPath={currentPath} guard={guard} forceOpen={query.length > 0} onMenu={setMenu} />
        ))}
      </div>

      {menu && <ContextMenu at={menu.screen} items={menu.items} onClose={() => setMenu(null)} />}

      <div className="tree-footer">
        <button onClick={() => setShowTrash((value) => !value)}>
          {showTrash ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Trash2 size={13} /> Trash
          <span className="ml-auto text-[11px]">{trash.length}</span>
        </button>
        {showTrash && (
          <div className="scroll pb-1" style={{ maxHeight: 160 }}>
            {trash.length === 0 && (
              <p className="px-2 pb-2 text-[12px]" style={{ color: 'var(--muted)' }}>
                Empty.
              </p>
            )}
            {trash.map((entry) => (
              <div key={entry.id} className="tree-row" style={{ paddingLeft: 8, cursor: 'default' }}>
                <FileText size={14} className="row-icon file" />
                <span className="flex-1 truncate" title={entry.originalPath}>
                  {entry.originalPath}
                </span>
                <span className="row-actions" style={{ display: 'inline-flex' }}>
                  <button title="Restore" onClick={() => guard(() => workspace.restore(entry.id))}>
                    <RotateCcw size={12} />
                  </button>
                  <button
                    className="danger"
                    title="Delete forever"
                    onClick={() => {
                      if (window.confirm(`Delete "${entry.originalPath}" forever?`)) void guard(() => workspace.deleteForever(entry.id));
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Guard = (action: () => Promise<unknown>) => Promise<void>;
type Workspace = ReturnType<typeof useWorkspaceStore.getState>;

/** New skill / new folder / paste. Used by a folder row and by the empty area. */
function folderMenuItems(folder: string, workspace: Workspace, guard: Guard): MenuItem[] {
  const clip = workspace.clipboard;
  return [
    { id: 'new', label: 'New skill', icon: <FilePlus2 size={14} />, run: () => void guard(() => workspace.createSkill(folder, 'new-skill')) },
    {
      id: 'newFolder',
      label: 'New folder',
      icon: <FolderPlus size={14} />,
      run: () => {
        const name = window.prompt('Folder name');
        if (name) void guard(() => workspace.createFolder(folder, name));
      },
    },
    {
      id: 'paste',
      label: clip ? `Paste "${clip.path.split('/').pop()}"` : 'Paste',
      icon: <ClipboardPaste size={14} />,
      disabled: !clip,
      run: () => void guard(() => workspace.pasteInto(folder)),
    },
  ];
}

function fileMenuItems(path: string, workspace: Workspace, guard: Guard, rename: () => void): MenuItem[] {
  return [
    { id: 'open', label: 'Open', icon: <SquarePlus size={14} />, run: () => void guard(() => workspace.openFile(path)) },
    { id: 'rename', label: 'Rename…', icon: <Pencil size={14} />, run: rename },
    { id: 'duplicate', label: 'Duplicate', icon: <Copy size={14} />, run: () => void guard(() => workspace.duplicate(path)) },
    { id: 'copy', label: 'Copy', icon: <Copy size={14} />, run: () => workspace.copyFile(path, false) },
    { id: 'cut', label: 'Cut', icon: <Scissors size={14} />, hint: 'move', run: () => workspace.copyFile(path, true) },
    { id: 'trash', label: 'Move to trash', icon: <Trash2 size={14} />, danger: true, run: () => void guard(() => workspace.trashFile(path)) },
  ];
}

function filterTree(entries: TreeEntry[], query: string): TreeEntry[] {
  if (!query) return entries;
  return entries.flatMap((entry) => {
    if (entry.type === 'file') return entry.name.toLowerCase().includes(query) ? [entry] : [];
    const children = filterTree(entry.children ?? [], query);
    return children.length || entry.name.toLowerCase().includes(query) ? [{ ...entry, children }] : [];
  });
}

function TreeRow({
  entry,
  depth,
  currentPath,
  guard,
  forceOpen,
  onMenu,
}: {
  entry: TreeEntry;
  depth: number;
  currentPath: string | null;
  guard: Guard;
  forceOpen: boolean;
  onMenu: (menu: { screen: { x: number; y: number }; items: MenuItem[] }) => void;
}) {
  const workspace = useWorkspaceStore();
  const expanded = useWorkspaceStore((state) => state.expanded[entry.path] ?? true) || forceOpen;
  const [dragOver, setDragOver] = useState(false);
  const isFolder = entry.type === 'folder';
  const active = entry.path === currentPath;

  const rename = () => {
    const base = entry.name.replace(/\.(md|json)$/i, '');
    const name = window.prompt(isFolder ? 'Folder name' : 'Skill name', base);
    if (!name || name === base) return;
    void guard(() => (isFolder ? workspace.renameFolder(entry.path, name) : workspace.rename(entry.path, name)));
  };

  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const screen = { x: event.clientX, y: event.clientY };
    if (isFolder) {
      onMenu({
        screen,
        items: [
          ...folderMenuItems(entry.path, workspace, guard),
          { id: 'renameFolder', label: 'Rename…', icon: <Pencil size={14} />, run: rename },
        ],
      });
      return;
    }
    onMenu({ screen, items: fileMenuItems(entry.path, workspace, guard, rename) });
  };

  return (
    <div>
      <div
        className={`tree-row ${active ? 'active' : ''} ${dragOver ? 'dragover' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!isFolder}
        onDragStart={(event) => {
          event.dataTransfer.setData(FILE_MIME, entry.path);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(event) => {
          if (isFolder && event.dataTransfer.types.includes(FILE_MIME)) {
            event.preventDefault();
            event.stopPropagation();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          setDragOver(false);
          const path = event.dataTransfer.getData(FILE_MIME);
          if (isFolder && path) {
            event.preventDefault();
            event.stopPropagation();
            void guard(() => workspace.move(path, entry.path));
          }
        }}
        onClick={() => (isFolder ? workspace.toggleExpanded(entry.path) : void guard(() => workspace.openFile(entry.path)))}
        onContextMenu={openMenu}
        title={entry.path}
      >
        {isFolder ? (
          expanded ? <ChevronDown size={12} className="chev" /> : <ChevronRight size={12} className="chev" />
        ) : (
          <span style={{ width: 12 }} />
        )}
        {isFolder ? (
          expanded ? <FolderOpen size={14} className="row-icon folder" /> : <FolderClosed size={14} className="row-icon folder" />
        ) : (
          <FileText size={14} className="row-icon file" />
        )}
        <span className={`flex-1 truncate ${active ? 'font-semibold' : ''}`}>{isFolder ? entry.name : entry.name.replace(/\.md$/i, '')}</span>
        <span className="row-actions">
          {!isFolder && (
            <button title="Duplicate" onClick={(event) => { event.stopPropagation(); void guard(() => workspace.duplicate(entry.path)); }}>
              <Copy size={12} />
            </button>
          )}
          {!isFolder && (
            <button title="Rename" onClick={(event) => { event.stopPropagation(); rename(); }}>
              <Pencil size={12} />
            </button>
          )}
          {!isFolder && (
            <button className="danger" title="Move to trash" onClick={(event) => { event.stopPropagation(); void guard(() => workspace.trashFile(entry.path)); }}>
              <Trash2 size={12} />
            </button>
          )}
          {isFolder && (
            <button title="New skill here" onClick={(event) => { event.stopPropagation(); void guard(() => workspace.createSkill(entry.path, 'new-skill')); }}>
              <FilePlus2 size={12} />
            </button>
          )}
        </span>
      </div>
      {isFolder && expanded && entry.children?.map((child) => <TreeRow key={child.path} entry={child} depth={depth + 1} currentPath={currentPath} guard={guard} forceOpen={forceOpen} onMenu={onMenu} />)}
    </div>
  );
}
