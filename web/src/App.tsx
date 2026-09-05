/**
 * Shell: top bar · left sidebar (Workspace / Nodes) · main view (Canvas,
 * Markdown, Runs) · right drawer · status bar.
 * Autosave, disk-change detection and global import live here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Code2, Download, FolderTree, HelpCircle, PanelLeft, PlayCircle, Puzzle, Settings, Waypoints } from 'lucide-react';
import type { PaletteEntry } from '@agent-skiller/core';
import { Canvas, type CanvasApi } from './canvas/Canvas.js';
import { NodeDrawer } from './drawer/NodeDrawer.js';
import { Palette } from './palette/Palette.js';
import { WorkspacePanel } from './workspace/WorkspacePanel.js';
import { MarkdownView } from './views/MarkdownView.js';
import { RunsPanel } from './views/RunsPanel.js';
import { ProblemsBar } from './views/ProblemsBar.js';
import { ShortcutsSheet } from './views/ShortcutsSheet.js';
import { SettingsDialog } from './views/SettingsDialog.js';
import { useSkillStore } from './store/skillStore.js';
import { downloadText, exportText, lastOpenedPath, useWorkspaceStore } from './store/workspaceStore.js';
import { useShortcuts } from './shared/useShortcuts.js';
import { ThemeToggle } from './shared/ThemeToggle.js';
import { nextThemePreference, readThemePreference, setThemePreference } from './shared/theme.js';
import { useToast } from './shared/Toast.js';

type MainView = 'canvas' | 'markdown' | 'runs';
type SideTab = 'workspace' | 'palette';

const VIEWS: { id: MainView; label: string; icon: typeof Waypoints }[] = [
  { id: 'canvas', label: 'Canvas', icon: Waypoints },
  { id: 'markdown', label: 'Markdown', icon: Code2 },
  { id: 'runs', label: 'Runs', icon: PlayCircle },
];

export function App() {
  const toast = useToast();
  const skill = useSkillStore((state) => state.skill);
  const path = useSkillStore((state) => state.path);
  const dirty = useSkillStore((state) => state.dirty);
  const saving = useSkillStore((state) => state.saving);
  const editingId = useSkillStore((state) => state.editingId);
  const diskChanged = useSkillStore((state) => state.diskChanged);
  const folderNeedsPermission = useWorkspaceStore((state) => state.folderNeedsPermission);
  const storageInfo = useWorkspaceStore((state) => state.info);
  const [localNoticeDismissed, setLocalNoticeDismissed] = useState(() => {
    try {
      return localStorage.getItem('skiller.localNoticeDismissed') === '1';
    } catch {
      return true;
    }
  });
  const workspace = useWorkspaceStore();
  const canvasApi = useRef<CanvasApi | null>(null);
  const [view, setView] = useState<MainView>('canvas');
  const [sideTab, setSideTab] = useState<SideTab>('workspace');
  const [sideOpen, setSideOpen] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);

  // Boot: pick where skills live, load the tree, then the last file (or the first one).
  useEffect(() => {
    void (async () => {
      try {
        await workspace.boot();
      } catch (error) {
        toast.show(`Storage failed to start: ${(error as Error).message}`, 'error');
        return;
      }
      const last = lastOpenedPath();
      const tree = useWorkspaceStore.getState().tree;
      const firstFile = (function find(entries: typeof tree): string | null {
        for (const entry of entries) {
          if (entry.type === 'file') return entry.path;
          const nested = entry.children ? find(entry.children) : null;
          if (nested) return nested;
        }
        return null;
      })(tree);
      const target = last ?? firstFile;
      if (target) {
        try {
          await workspace.openFile(target);
        } catch {
          if (firstFile && firstFile !== target) await workspace.openFile(firstFile).catch(() => undefined);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave, debounced. Reads the store at fire time rather than depending on
  // it, so the tree poll cannot keep pushing the save back.
  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      useWorkspaceStore
        .getState()
        .saveNow()
        .catch((error: Error) => toast.show(`Save failed: ${error.message}`, 'error'));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [dirty, skill, toast]);

  // Disk watch and tree refresh.
  useEffect(() => {
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      // Every 2.5 s while visible, every 10 s in a hidden tab (embedded previews report hidden).
      if (document.hidden && tick % 4 !== 0) return;
      void useWorkspaceStore.getState().checkDisk();
      void useWorkspaceStore.getState().refresh();
    }, 2500);
    return () => window.clearInterval(timer);
  }, []);

  const saveNow = useCallback(() => {
    workspace.saveNow().then(() => toast.show('Saved.')).catch((error: Error) => toast.show(`Save failed: ${error.message}`, 'error'));
  }, [workspace, toast]);

  const doExport = useCallback(
    (format: 'md' | 'json' | 'copy') => {
      if (!skill) return;
      setExportOpen(false);
      if (format === 'copy') {
        void navigator.clipboard.writeText(exportText(skill, 'md')).then(() => toast.show('Markdown copied.'));
        return;
      }
      downloadText(`${skill.name}.${format}`, exportText(skill, format));
    },
    [skill, toast],
  );

  useShortcuts([
    { combo: 'shift+?', run: () => setShowShortcuts((value) => !value) },
    { combo: '?', run: () => setShowShortcuts((value) => !value) },
    { combo: 'mod+k', run: () => setSideOpen((value) => !value) },
    { combo: 'mod+shift+l', run: () => setThemePreference(nextThemePreference(readThemePreference())), allowInEditable: true },
    { combo: 'mod+,', run: () => setShowSettings(true), allowInEditable: true },
  ]);

  // Global drop of files anywhere on the app.
  useEffect(() => {
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      const files = [...event.dataTransfer.files].filter((file) => /\.(md|json|markdown|txt)$/i.test(file.name));
      if (!files.length) return;
      event.preventDefault();
      void Promise.all(files.map(async (file) => ({ name: file.name, text: await file.text() })))
        .then((items) => workspace.importFiles(items))
        .then((paths) => toast.show(`Imported ${paths.length} file${paths.length > 1 ? 's' : ''}.`))
        .catch((error: Error) => toast.show(error.message, 'error'));
    };
    const onDragOver = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    };
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => {
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, [workspace, toast]);

  const addFromPalette = (entry: PaletteEntry) => {
    if (view !== 'canvas') setView('canvas');
    window.setTimeout(() => canvasApi.current?.addAtCenter(entry), view === 'canvas' ? 0 : 50);
  };

  return (
    <div className="h-full flex flex-col">
      <header className="topbar shrink-0">
        <button className="btn icon" title="Toggle sidebar (⌘K)" onClick={() => setSideOpen((value) => !value)}>
          <PanelLeft size={16} />
        </button>
        <span className="brand">
          <span className="brand-mark">
            <Puzzle size={15} />
          </span>
          AgentSkiller
        </span>
        {skill && (
          <div className="crumb">
            <span className="sep">/</span>
            <button className="title truncate" onClick={() => setMetaOpen((value) => !value)} title="Edit name, description and tags">
              {skill.title || skill.name}
            </button>
            <span className="hidden md:inline truncate" title={path ?? ''}>
              {path}
            </span>
            <span className={`save-dot ${dirty ? 'dirty' : ''}`} title={saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'} />
          </div>
        )}
        <span className="flex-1" />
        {skill && (
          <div className="segmented">
            {VIEWS.map((option) => (
              <button key={option.id} className={view === option.id ? 'active' : ''} onClick={() => setView(option.id)}>
                <option.icon size={14} />
                {option.label}
              </button>
            ))}
          </div>
        )}
        <span className="w-2" />
        {skill && (
          <div className="relative">
            <button className="btn primary" onClick={() => setExportOpen((value) => !value)} title="Export (⌘E)">
              <Download size={14} /> Export
            </button>
            {exportOpen && (
              <div className="menu" onMouseLeave={() => setExportOpen(false)}>
                <button onClick={() => doExport('md')}>Download .md</button>
                <button onClick={() => doExport('json')}>Download .json</button>
                <button onClick={() => doExport('copy')}>Copy Markdown</button>
                <button
                  onClick={() => {
                    setExportOpen(false);
                    workspace
                      .exportAll()
                      .then((bundle) => {
                        downloadText(`agent-skiller-workspace-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(bundle, null, 2)}\n`);
                        toast.show(`Exported ${bundle.files.length} skills.`);
                      })
                      .catch((error: Error) => toast.show(error.message, 'error'));
                  }}
                >
                  Export whole workspace…
                </button>
              </div>
            )}
          </div>
        )}
        <ThemeToggle />
        <button className="btn icon" title="Shortcuts (?)" onClick={() => setShowShortcuts(true)}>
          <HelpCircle size={16} />
        </button>
        <button className="btn icon" title="Settings (⌘,)" onClick={() => setShowSettings(true)} aria-label="Settings">
          <Settings size={16} />
        </button>
      </header>

      {metaOpen && skill && <MetaEditor onClose={() => setMetaOpen(false)} />}

      {storageInfo?.kind === 'browser' && !localNoticeDismissed && (
        <div className="banner-info flex items-center gap-3 px-3 py-1.5 text-[12px]">
          <span className="flex-1">
            Your skills are saved in this browser only. Nothing is uploaded, and nobody else can see them; clearing this site's data deletes them. Export from Settings → Storage to keep a copy.
          </span>
          <button className="btn outline" onClick={() => setShowSettings(true)}>
            Storage settings
          </button>
          <button
            className="btn icon"
            title="Got it"
            aria-label="Dismiss"
            onClick={() => {
              setLocalNoticeDismissed(true);
              try {
                localStorage.setItem('skiller.localNoticeDismissed', '1');
              } catch {
                // ignore
              }
            }}
          >
            ×
          </button>
        </div>
      )}

      {folderNeedsPermission && (
        <div className="banner-warn flex items-center gap-3 px-3 py-1.5 text-[12px]">
          Your linked folder needs permission again after the reload. Until then, skills are read from this browser.
          <button className="btn outline" onClick={() => workspace.reconnectFolder().then((ok) => toast.show(ok ? 'Folder reconnected.' : 'The browser did not grant access.', ok ? 'info' : 'error'))}>
            Reconnect folder
          </button>
        </div>
      )}

      {diskChanged && (
        <div className="banner-warn flex items-center gap-3 px-3 py-1.5 text-[12px]">
          This file changed on disk while you had unsaved edits.
          <button className="btn outline" onClick={() => path && workspace.openFile(path).then(() => useSkillStore.getState().setDiskChanged(false))}>
            Reload from disk
          </button>
          <button className="btn outline" onClick={() => { useSkillStore.getState().setDiskChanged(false); saveNow(); }}>
            Keep mine
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {sideOpen && (
          <aside className="sidebar shrink-0">
            <div className="sidebar-head">
              <div className="segmented stretch">
                <button className={sideTab === 'workspace' ? 'active' : ''} onClick={() => setSideTab('workspace')}>
                  <FolderTree size={14} /> Workspace
                </button>
                <button className={sideTab === 'palette' ? 'active' : ''} onClick={() => setSideTab('palette')}>
                  <Puzzle size={14} /> Nodes
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {sideTab === 'workspace' ? (
                <WorkspacePanel />
              ) : skill ? (
                <div className="scroll">
                  <Palette onAdd={addFromPalette} onAddNote={() => canvasApi.current?.addNoteAtCenter()} hasStart={skill.nodes.some((node) => node.type === 'start')} />
                </div>
              ) : (
                <p className="p-3 text-[12px]" style={{ color: 'var(--muted)' }}>
                  Open a skill first.
                </p>
              )}
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0">
              {!skill && <EmptyState />}
              {skill && view === 'canvas' && <Canvas apiRef={canvasApi} onSave={saveNow} onExport={() => setExportOpen(true)} />}
              {skill && view === 'markdown' && <MarkdownView />}
              {skill && view === 'runs' && <RunsPanel />}
            </div>
            {skill && view === 'canvas' && editingId !== null && <NodeDrawer />}
          </div>
          <ProblemsBar />
        </main>
      </div>

      {showShortcuts && <ShortcutsSheet onClose={() => setShowShortcuts(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function EmptyState() {
  const workspace = useWorkspaceStore();
  return (
    <div className="h-full grid place-items-center">
      <div className="text-center space-y-3">
        <span className="brand-mark mx-auto" style={{ width: 40, height: 40, borderRadius: 12 }}>
          <Puzzle size={20} />
        </span>
        <div className="font-semibold text-[15px]">No skill open</div>
        <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
          Pick one in the workspace, drop a .md or .json file anywhere, or start fresh.
        </p>
        <button className="btn primary" onClick={() => void workspace.createSkill('', 'new-skill')}>
          New skill
        </button>
      </div>
    </div>
  );
}

function MetaEditor({ onClose }: { onClose: () => void }) {
  const skill = useSkillStore((state) => state.skill)!;
  const setMeta = useSkillStore((state) => state.setMeta);
  return (
    <div className="px-4 py-3 border-b grid gap-3" style={{ background: 'var(--panel-2)', borderColor: 'var(--line)', gridTemplateColumns: '1fr 2fr 1fr auto' }}>
      <label className="text-[12px]">
        <span className="section-title block">Title</span>
        <input className="field w-full" value={skill.title} onChange={(event) => setMeta({ title: event.target.value })} />
      </label>
      <label className="text-[12px]">
        <span className="section-title block">Description · one line agents read to pick this skill</span>
        <input className="field w-full" value={skill.description} onChange={(event) => setMeta({ description: event.target.value })} />
      </label>
      <label className="text-[12px]">
        <span className="section-title block">Tags · comma separated</span>
        <input className="field w-full" value={skill.tags.join(', ')} onChange={(event) => setMeta({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
      </label>
      <button className="btn outline self-end" onClick={onClose}>
        Done
      </button>
      <label className="text-[12px]" style={{ gridColumn: '1 / -1' }}>
        <span className="section-title block">Purpose · paragraph under the title</span>
        <textarea className="field w-full" rows={2} value={skill.purpose} onChange={(event) => setMeta({ purpose: event.target.value })} />
      </label>
    </div>
  );
}
