/**
 * Test runs. You play the agent: the server shows the current step, you
 * report what happened, and code steps execute in the sandbox on the way.
 */
import { useCallback, useEffect, useState } from 'react';
import { describeStep } from '@agent-skiller/core';
import { Play, RefreshCw } from 'lucide-react';
import type { RunView } from '../api.js';
import { runs as runner } from '../runs.js';
import { useSkillStore } from '../store/skillStore.js';
import { useWorkspaceStore } from '../store/workspaceStore.js';
import { useToast } from '../shared/Toast.js';

export function RunsPanel() {
  const skill = useSkillStore((state) => state.skill);
  const problems = useSkillStore((state) => state.problems);
  const saveNow = useWorkspaceStore((state) => state.saveNow);
  const toast = useToast();
  const [runs, setRuns] = useState<RunView[]>([]);
  const [current, setCurrent] = useState<RunView | null>(null);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await runner.list();
      setRuns(list);
      setCurrent((existing) => (existing ? (list.find((run) => run.id === existing.id) ?? existing) : existing));
    } catch {
      // Offline: keep what we have.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = async () => {
    if (!skill) return;
    setBusy(true);
    try {
      await saveNow();
      const run = await runner.start(skill, input.trim() ? tryJson(input) : null);
      setCurrent(run);
      setOutput('');
      await refresh();
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const report = async (status: 'ok' | 'fail', choose?: string) => {
    if (!current) return;
    setBusy(true);
    try {
      const run = await runner.next(current.id, {
        status,
        ...(output.trim() ? { output: tryJson(output) } : {}),
        ...(choose ? { choose } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setCurrent(run);
      setOutput('');
      setMessage('');
      await refresh();
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const hasErrors = problems.some((problem) => problem.severity === 'error');
  const hasSandbox = runner.hasSandbox();

  return (
    <div className="h-full flex" style={{ minHeight: 0 }}>
      <div className="w-64 border-r flex flex-col" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--line)' }}>
          <span className="section-title" style={{ marginBottom: 0 }}>Runs</span>
          <span className="flex-1" />
          <button className="btn icon" title="Refresh" onClick={() => void refresh()}>
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="flex-1 scroll">
          {runs.length === 0 && (
            <p className="px-3 py-3 text-[12px]" style={{ color: 'var(--muted)' }}>
              No runs yet. Start one here{hasSandbox ? <>, or connect an agent to <code>/mcp</code></> : ''}.
            </p>
          )}
          {runs.map((run) => (
            <button key={run.id} className="w-full text-left px-3 py-1.5 text-[12px] border-b" style={{ borderColor: 'var(--line)', background: current?.id === run.id ? 'var(--accent-soft)' : undefined }} onClick={() => setCurrent(run)}>
              <div className="flex items-center gap-2">
                <StatusDot status={run.status} />
                <span className="font-semibold truncate">{run.skillName}</span>
              </div>
              <div style={{ color: 'var(--muted)' }}>
                {run.steps.length} step{run.steps.length === 1 ? '' : 's'} · {new Date(run.updatedAt).toLocaleTimeString()}
              </div>
            </button>
          ))}
        </div>
        <div className="p-3 border-t space-y-2" style={{ borderColor: 'var(--line)' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Start a test run</div>
          <input className="field" placeholder="Input for Start (text or JSON)" value={input} onChange={(event) => setInput(event.target.value)} />
          <button className="btn primary w-full justify-center" onClick={start} disabled={!skill || busy || hasErrors} title={hasErrors ? 'Fix the errors first' : 'Save and start'}>
            <Play size={12} /> Run {skill?.name ?? ''}
          </button>
        </div>
      </div>

      <div className="flex-1 scroll p-4">
        {!current && (
          <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
            {hasSandbox ? (
              <>
                Pick a run on the left. Agents connect over MCP at <code>{window.location.origin}/mcp</code> and use start_run / next_step; this panel lets you walk a skill by hand the same way.
              </>
            ) : (
              <>
                Pick a run on the left, or start one. Without the local server there is no sandbox: when a run reaches a Code step you run the code yourself and paste what it printed. Agents connect through <code>./run.sh</code>.
              </>
            )}
          </p>
        )}
        {current && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex items-center gap-2">
              <StatusDot status={current.status} />
              <span className="font-semibold">{current.skillName}</span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                {current.id}
              </span>
            </div>
            {current.status === 'done' && (
              <div className="rounded-lg p-3" style={{ background: 'var(--panel-2)' }}>
                <div className="section-title">Result</div>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{stringify(current.result)}</pre>
              </div>
            )}
            {current.status === 'failed' && (
              <div className="problem-error rounded-lg p-3">
                {current.error}
              </div>
            )}
            {current.status === 'running' && current.step && (
              <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: 'var(--accent)', background: 'var(--panel)' }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12.5 }}>{describeStep(current.step)}</pre>
                {current.step.type === 'code' && current.step.code && (
                  <div className="space-y-1">
                    <div className="section-title" style={{ marginBottom: 0 }}>
                      Run this yourself, then paste what it printed as the output
                    </div>
                    <pre className="field scroll" style={{ maxHeight: 200, whiteSpace: 'pre-wrap', fontSize: 11.5, background: 'var(--panel-2)' }}>
                      {current.step.code.code}
                    </pre>
                    <p className="muted-text">
                      stdin would be: <code>{JSON.stringify(current.step.code.input).slice(0, 200)}</code>
                    </p>
                  </div>
                )}
                {current.subSkillMarkdown && (
                  <details>
                    <summary className="text-[12px] cursor-pointer">Sub-skill "{current.step.subSkill}"</summary>
                    <pre className="field scroll mt-1" style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, maxHeight: 240 }}>
                      {current.subSkillMarkdown}
                    </pre>
                  </details>
                )}
                <div className="space-y-1">
                  <div className="section-title" style={{ marginBottom: 0 }}>Output (what the step produced; JSON is understood)</div>
                  <textarea className="field" rows={2} value={output} onChange={(event) => setOutput(event.target.value)} />
                  <input className="field" placeholder="Message (optional, e.g. why it failed)" value={message} onChange={(event) => setMessage(event.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {current.step.choices.length > 0 ? (
                    current.step.choices.map((choice) => (
                      <button key={choice} className="btn primary" onClick={() => report('ok', choice)} disabled={busy}>
                        {choice}
                      </button>
                    ))
                  ) : (
                    <button className="btn primary" onClick={() => report('ok')} disabled={busy}>
                      Done (ok)
                    </button>
                  )}
                  <button className="btn danger" onClick={() => report('fail')} disabled={busy}>
                    Failed
                  </button>
                </div>
              </div>
            )}
            <div>
              <div className="section-title">Trace</div>
              <table className="w-full text-[12px]">
                <tbody>
                  {current.steps.map((step, index) => (
                    <tr key={index} className="border-t" style={{ borderColor: 'var(--line)' }}>
                      <td className="py-1 pr-2 font-mono" style={{ color: 'var(--muted)' }}>
                        {step.nodeId}
                      </td>
                      <td className="py-1 pr-2">{step.name}</td>
                      <td className="py-1 pr-2" style={{ color: step.status === 'ok' ? 'var(--ok)' : 'var(--danger)' }}>
                        {step.status}
                        {step.handle ? ` → ${step.handle}` : ''}
                      </td>
                      <td className="py-1 truncate max-w-[280px]" style={{ color: 'var(--muted)' }} title={stringify(step.output)}>
                        {step.message || stringify(step.output)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: RunView['status'] }) {
  const color = status === 'done' ? 'var(--ok)' : status === 'failed' ? 'var(--danger)' : 'var(--accent)';
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} title={status} />;
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 1);
}
