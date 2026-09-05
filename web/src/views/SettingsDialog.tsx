/**
 * Settings: the model provider, where the workspace lives, how an agent
 * connects, and appearance. The API key is stored by the server and never
 * comes back to the page, so this only ever shows whether one is set.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Eye, EyeOff, FolderOpen, HardDrive, Loader2, RefreshCw, Server, Upload, X } from 'lucide-react';
import { NODE_META, SKILL_FORMAT } from '@agent-skiller/core';
import { api, type ModelOption } from '../api.js';
import { ai as aiClient, type SettingsView } from '../ai.js';
import { downloadText, useWorkspaceStore, type Bundle } from '../store/workspaceStore.js';
import { folderApiAvailable } from '../storage/index.js';
import { useToast } from '../shared/Toast.js';
import { useTheme, type ThemePreference } from '../shared/theme.js';

interface Preset {
  id: string;
  label: string;
  baseUrl: string;
  note: string;
  needsKey: boolean;
}

const PRESETS: Preset[] = [
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', note: 'One key, most models. Keys at openrouter.ai/keys.', needsKey: true },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', note: 'Keys at platform.openai.com/api-keys.', needsKey: true },
  { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', note: 'Keys at console.anthropic.com.', needsKey: true },
  { id: 'ollama', label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', note: 'Runs on your machine; no key needed.', needsKey: false },
  { id: 'lmstudio', label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', note: 'Start the local server in LM Studio first.', needsKey: false },
  { id: 'custom', label: 'Custom', baseUrl: '', note: 'Any endpoint that answers GET {base}/models.', needsKey: false },
];

type Tab = 'storage' | 'ai' | 'connect' | 'appearance' | 'about';

const TABS: { id: Tab; label: string }[] = [
  { id: 'storage', label: 'Storage' },
  { id: 'ai', label: 'AI provider' },
  { id: 'connect', label: 'Connection' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('storage');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    /* Closing is the X, Cancel or Escape: a backdrop click used to discard a half-typed key. */
    <div className="overlay fixed inset-0 z-50 grid place-items-center">
      <div className="settings-dialog" role="dialog" aria-label="Settings">
        <header className="settings-head">
          <span className="font-semibold text-[14px]">Settings</span>
          <span className="flex-1" />
          <button className="btn icon" onClick={onClose} title="Close (Esc)" aria-label="Close settings">
            <X size={16} />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            {TABS.map((entry) => (
              <button key={entry.id} className={tab === entry.id ? 'active' : ''} onClick={() => setTab(entry.id)}>
                {entry.label}
              </button>
            ))}
          </nav>
          <div className="settings-pane scroll">
            {tab === 'storage' && <StorageSection toast={toast} />}
            {tab === 'ai' && <AiSection toast={toast} />}
            {tab === 'connect' && <ConnectionSection toast={toast} />}
            {tab === 'appearance' && <AppearanceSection />}
            {tab === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function AiSection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const preset = PRESETS.find((entry) => entry.baseUrl === baseUrl.trim()) ?? PRESETS[PRESETS.length - 1]!;

  useEffect(() => {
    void aiClient
      .settings()
      .then((current) => {
        setSettings(current);
        setBaseUrl(current.ai.baseUrl);
        setModel(current.ai.model);
      })
      .catch((problem: Error) => setError(problem.message));
  }, []);

  const loadModels = useCallback(
    async (probe: { baseUrl?: string; apiKey?: string } = {}) => {
      setLoading(true);
      setError('');
      try {
        const list = await aiClient.models(probe);
        setModels(list);
        setStatus(list.length ? `${list.length} models available.` : 'The provider returned no models.');
      } catch (problem) {
        setModels([]);
        setStatus('');
        setError((problem as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const save = async () => {
    setError('');
    try {
      const patch: { ai: Record<string, string> } = { ai: { provider: preset.id, baseUrl: baseUrl.trim(), model: model.trim() } };
      if (apiKey) patch.ai['apiKey'] = apiKey;
      const next = await aiClient.saveSettings(patch);
      setSettings(next);
      setApiKey('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      toast.show('Settings saved.');
    } catch (problem) {
      setError((problem as Error).message);
    }
  };

  const clearKey = async () => {
    setSettings(await aiClient.saveSettings({ ai: { apiKey: '' } }));
    setApiKey('');
    toast.show('API key removed.');
  };

  if (!settings) return <p className="muted-text">Loading…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="settings-title">Model provider</h3>
        <p className="muted-text">
          Any endpoint that answers <code>GET {'{base}'}/models</code>.{' '}
          {settings.mode === 'server'
            ? 'The key is stored by the local server, in the workspace folder, and is never sent back to this page.'
            : 'There is no server here, so the key is kept in this browser only and sent straight to the provider you chose. Ollama and LM Studio need CORS enabled in their settings for this to work.'}
        </p>
      </div>

      <label className="block">
        <span className="section-title block">Provider</span>
        <select
          className="field w-full"
          value={preset.id}
          onChange={(event) => {
            const chosen = PRESETS.find((entry) => entry.id === event.target.value)!;
            if (chosen.baseUrl) setBaseUrl(chosen.baseUrl);
            setModels([]);
            setStatus('');
          }}
        >
          {PRESETS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <span className="muted-text mt-1 block">{preset.note}</span>
      </label>

      <label className="block">
        <span className="section-title block">API base URL</span>
        <input className="field w-full" value={baseUrl} placeholder="https://openrouter.ai/api/v1" onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} />
      </label>

      <label className="block">
        <span className="section-title block">API key {settings.ai.apiKeySet && <span className="key-set">saved</span>}</span>
        <div className="flex gap-1">
          <input
            className="field flex-1"
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            placeholder={settings.ai.apiKeySet ? 'Stored. Type a new key to replace it.' : 'sk-…'}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn icon" title={showKey ? 'Hide' : 'Show'} onClick={() => setShowKey((value) => !value)}>
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          {settings.ai.apiKeySet && (
            <button className="btn outline" onClick={clearKey}>
              Remove
            </button>
          )}
        </div>
      </label>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="section-title" style={{ marginBottom: 0 }}>
            Model
          </span>
          <span className="flex-1" />
          <button className="btn outline" onClick={() => loadModels({ baseUrl: baseUrl.trim(), apiKey })} disabled={loading}>
            {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {models.length ? 'Refresh' : 'Load models'}
          </button>
        </div>
        <input
          className="field w-full"
          list="skiller-models"
          value={model}
          placeholder={models.length ? 'Pick one, or type an id' : 'Load the list, or type an id'}
          onChange={(event) => setModel(event.target.value)}
          spellCheck={false}
        />
        <datalist id="skiller-models">
          {models.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name === option.id ? '' : option.name}
            </option>
          ))}
        </datalist>
        {status && <span className="muted-text mt-1 block">{status}</span>}
      </div>

      {error && <div className="problem-error px-3 py-2 rounded text-[12px]">{error}</div>}

      <div className="flex items-center gap-2">
        <button className="btn primary" onClick={save}>
          {saved ? <Check size={14} /> : null} {saved ? 'Saved' : 'Save'}
        </button>
        <span className="muted-text">Used by features that call a model. Skills themselves never need a key.</span>
      </div>
    </div>
  );
}

function StorageSection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const workspace = useWorkspaceStore();
  const info = workspace.info;
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const canLinkFolder = folderApiAvailable();

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      toast.show(label);
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportAll = () =>
    run('Workspace exported.', async () => {
      const bundle = await workspace.exportAll();
      downloadText(`agent-skiller-workspace-${new Date().toISOString().slice(0, 10)}.json`, `${JSON.stringify(bundle, null, 2)}\n`);
    });

  const importAll = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    await run('Workspace imported.', async () => {
      const parsed = JSON.parse(await file.text()) as Partial<Bundle>;
      if (parsed.format !== 'agent-skiller/bundle/1' || !Array.isArray(parsed.files)) throw new Error('That is not a workspace export.');
      const count = await workspace.importBundle(parsed as Bundle);
      toast.show(`${count} skills imported.`);
    });
  };

  const options: { kind: 'server' | 'browser' | 'folder'; icon: typeof Server; title: string; body: string; available: boolean; action: () => Promise<unknown>; note?: string }[] = [
    {
      kind: 'server',
      icon: Server,
      title: 'Local server',
      body: 'Real .md files on this machine. Code steps execute, agents connect over MCP, and any text editor can open the files.',
      available: workspace.serverAvailable,
      action: () => workspace.switchToServer(),
      note: workspace.serverAvailable ? undefined : 'Not running. Start it with ./run.sh.',
    },
    {
      kind: 'browser',
      icon: HardDrive,
      title: 'This browser',
      body: 'Kept in this browser profile, on this device. Nothing leaves the machine. Clearing site data deletes it, so export now and then.',
      available: true,
      action: () => workspace.switchToBrowser(),
    },
    {
      kind: 'folder',
      icon: FolderOpen,
      title: 'A folder on this computer',
      body: 'Real .md files you pick, edited by the browser directly. Works in Chrome and Edge; the browser asks for the folder again after a reload.',
      available: canLinkFolder,
      action: () => workspace.linkFolder(),
      note: canLinkFolder ? undefined : 'This browser does not support the folder API.',
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="settings-title">Where skills are kept</h3>
        <p className="muted-text">
          Right now: <strong>{info?.label ?? '…'}</strong>
          {info?.location ? <span> · {info.location}</span> : null}. Switching does not copy anything; export first if you want to carry skills across.
        </p>
      </div>

      <div className="space-y-2">
        {options.map((option) => {
          const current = info?.kind === option.kind;
          return (
            <div key={option.kind} className={`storage-option${current ? ' current' : ''}`}>
              <option.icon size={18} className="shrink-0" style={{ color: current ? 'var(--accent)' : 'var(--muted)', marginTop: 2 }} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[12.5px]">
                  {option.title}
                  {current && <span className="key-set">current</span>}
                </div>
                <p className="muted-text">{option.body}</p>
                {option.note && <p className="muted-text" style={{ color: 'var(--warn-text)' }}>{option.note}</p>}
              </div>
              {!current && (
                <button className="btn outline shrink-0" disabled={!option.available || busy} onClick={() => run(`Switched to ${option.title.toLowerCase()}.`, option.action)}>
                  {option.kind === 'folder' ? 'Link folder…' : 'Use'}
                </button>
              )}
              {current && option.kind === 'folder' && (
                <button className="btn outline shrink-0" disabled={busy} onClick={() => run('Folder unlinked.', () => workspace.unlinkFolder())}>
                  Unlink
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <span className="section-title block">Backup and move</span>
        <div className="flex flex-wrap gap-2">
          <button className="btn outline" onClick={exportAll} disabled={busy}>
            <Download size={14} /> Export whole workspace
          </button>
          <button className="btn outline" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Upload size={14} /> Import a workspace export
          </button>
          <input ref={fileInput} type="file" accept=".json" hidden onChange={(event) => void importAll(event.target.files).then(() => (event.target.value = ''))} />
        </div>
        <p className="muted-text mt-1">One JSON file holding every skill and folder. Drop it onto the app later, here or on another device, and the tree comes back.</p>
      </div>
    </div>
  );
}

function ConnectionSection({ toast }: { toast: ReturnType<typeof useToast> }) {
  const workspaceDir = useWorkspaceStore((state) => state.workspaceDir);
  const online = useWorkspaceStore((state) => state.online);
  const info = useWorkspaceStore((state) => state.info);
  const origin = window.location.origin;
  const copy = (text: string, what: string) => void navigator.clipboard.writeText(text).then(() => toast.show(`${what} copied.`));

  if (!info?.hasServer) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="settings-title">How an agent connects</h3>
          <p className="muted-text">
            Agents talk to the local server over MCP, and Code steps run in its sandbox. This page is running without one, so those two things are off. Everything else works.
          </p>
        </div>
        <Row label="Run it on your machine" value="git clone https://github.com/lattebbrook/agent-skiller && cd agent-skiller && ./run.sh" onCopy={copy} />
        <p className="muted-text">
          Then export this workspace from Storage and drop the file onto the local app, or link the folder the server uses. The server reads the same <code>.md</code> files.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="settings-title">How an agent connects</h3>
        <p className="muted-text">Point any MCP client at one of these. The agent then lists skills, runs them step by step, and can save new ones.</p>
      </div>
      <Row label="MCP over HTTP" value={`${origin}/mcp`} onCopy={copy} />
      <Row label="MCP client config" value={JSON.stringify({ mcpServers: { 'agent-skiller': { url: `${origin}/mcp` } } })} onCopy={copy} />
      <Row label="MCP over stdio" value="node server/dist/mcp-stdio.js" onCopy={copy} />
      <Row label="Workspace folder" value={workspaceDir || 'unknown'} onCopy={copy} />
      <div>
        <span className="section-title block">Server</span>
        <span className={online ? 'status-ok' : 'status-bad'}>{online ? 'Connected' : 'Not reachable'}</span>
      </div>
    </div>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy: (text: string, what: string) => void }) {
  return (
    <div>
      <span className="section-title block">{label}</span>
      <div className="flex gap-1">
        <input className="field flex-1 mono" value={value} readOnly onFocus={(event) => event.target.select()} />
        <button className="btn icon" title="Copy" onClick={() => onCopy(value, label)}>
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const { preference, resolved, set } = useTheme();
  const options: { id: ThemePreference; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];
  return (
    <div className="space-y-5">
      <div>
        <h3 className="settings-title">Theme</h3>
        <p className="muted-text">Following the system setting right now shows {resolved}. ⌘⇧L cycles it from anywhere.</p>
      </div>
      <div className="segmented">
        {options.map((option) => (
          <button key={option.id} className={preference === option.id ? 'active' : ''} onClick={() => set(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AboutSection() {
  const [version, setVersion] = useState('');
  const hasServer = useWorkspaceStore((state) => state.info?.hasServer === true);
  useEffect(() => {
    if (!hasServer) {
      setVersion('0.1.0 (static build)');
      return;
    }
    void api.health().then((health) => setVersion(health.version)).catch(() => setVersion(''));
  }, [hasServer]);
  return (
    <div className="space-y-4">
      <div>
        <h3 className="settings-title">AgentSkiller</h3>
        <p className="muted-text">Draw a skill, export Markdown an agent can follow step by step.</p>
      </div>
      <dl className="about-grid">
        <dt>Version</dt>
        <dd>{version || '—'}</dd>
        <dt>Skill format</dt>
        <dd className="mono">{SKILL_FORMAT}</dd>
        <dt>Node kinds</dt>
        <dd>{Object.keys(NODE_META).length}</dd>
        <dt>Shortcuts</dt>
        <dd>
          Press <span className="kbd">?</span>
        </dd>
      </dl>
      <p className="muted-text">
        Skills are plain <code>.md</code> files in the workspace folder. Edit them in any editor and the canvas follows.
      </p>
    </div>
  );
}
