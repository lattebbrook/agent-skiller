/**
 * The right-hand editor for the selected node: type, name, settings, the
 * instruction box, stages, and the list of nodes that can be dragged in as
 * `${n}` references. Code nodes get a Test button that runs in the sandbox.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { NODE_META, NODE_TYPES, asList, asText, makeRef, serializeNodeMarkdown, type ConfigValue, type NodeType, type SkillNode, type Stage } from '@agent-skiller/core';
import { ChevronDown, ChevronRight, Play, Trash2, TriangleAlert, X } from 'lucide-react';
import { api, type SandboxResult } from '../api.js';
import { problemsFor, useSkillStore } from '../store/skillStore.js';
import { upstreamNodes } from '../store/skillOps.js';
import { useToast } from '../shared/Toast.js';
import { useWorkspaceStore } from '../store/workspaceStore.js';
import { CodeEditor, type CodeEditorHandle } from './CodeEditor.js';
import { ConfigFields, ListField } from './ConfigFields.js';
import { NodeIcon } from '../canvas/nodeIcons.js';

export function NodeDrawer() {
  const skill = useSkillStore((state) => state.skill);
  const editingId = useSkillStore((state) => state.editingId);
  const problems = useSkillStore((state) => state.problems);
  const updateNode = useSkillStore((state) => state.updateNode);
  const removeItems = useSkillStore((state) => state.removeItems);
  const setEditing = useSkillStore((state) => state.setEditing);
  const toast = useToast();
  const hasSandbox = useWorkspaceStore((state) => state.info?.hasServer === true);
  const editor = useRef<CodeEditorHandle>(null);
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [testInput, setTestInput] = useState('{"input": null, "steps": {}}');
  const [testResult, setTestResult] = useState<SandboxResult | null>(null);
  const [testing, setTesting] = useState(false);

  const node = useMemo(() => skill?.nodes.find((candidate) => candidate.id === editingId) ?? null, [skill, editingId]);
  const refNames = useMemo(() => Object.fromEntries((skill?.nodes ?? []).map((candidate) => [candidate.id, candidate.name])) as Record<number, string>, [skill]);
  const upstream = useMemo(() => (skill && node ? upstreamNodes(skill, node.id) : []), [skill, node]);
  const others = useMemo(() => (skill && node ? skill.nodes.filter((candidate) => candidate.id !== node.id && !upstream.some((up) => up.id === candidate.id) && candidate.type !== 'start') : []), [skill, node, upstream]);

  useEffect(() => {
    setTestResult(null);
  }, [editingId]);

  if (!skill || !node) return null;
  const meta = NODE_META[node.type];
  const own = problemsFor(problems, node.id);
  const language: 'python' | 'javascript' | 'markdown' | 'plain' =
    node.type === 'code' ? (asText(node.config['language']) === 'javascript' ? 'javascript' : 'python') : node.type === 'command' ? 'plain' : 'markdown';

  const insertRef = (id: number, name: string) => editor.current?.insert(makeRef(id, name));
  const patch = (changes: Partial<Omit<SkillNode, 'id'>>) => updateNode(node.id, changes);
  const setStages = (stages: Stage[]) => patch({ stages: stages.map((stage, index) => ({ ...stage, id: `${node.id}.${index + 1}` })) });

  const runTest = async () => {
    let input: unknown = null;
    try {
      input = JSON.parse(testInput || 'null');
    } catch {
      toast.show('Test input must be JSON.', 'error');
      return;
    }
    setTesting(true);
    try {
      setTestResult(await api.runCode(language, node.body, input));
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <aside className="drawer h-full" aria-label="Node editor">
      <div className="drawer-head">
        <NodeIcon type={node.type} size={28} color={meta.color} />
        <span className="idpill">{node.id}</span>
        <select className="pill-select" value={node.type} onChange={(event) => patch({ type: event.target.value as NodeType })} disabled={node.type === 'start'} title="Node type">
          {NODE_TYPES.filter((type) => type !== 'start' || node.type === 'start').map((type) => (
            <option key={type} value={type}>
              {NODE_META[type].label}
            </option>
          ))}
        </select>
        <input className="field flex-1" value={node.name} placeholder={meta.namePlaceholder} onChange={(event) => patch({ name: event.target.value })} aria-label="Node name" />
        <button className="btn icon danger" title="Delete node" onClick={() => removeItems([String(node.id)])} disabled={node.type === 'start'}>
          <Trash2 size={14} />
        </button>
        <button className="btn icon" title="Close (Esc)" onClick={() => setEditing(null)}>
          <X size={14} />
        </button>
      </div>

      <div className="drawer-body flex-1 scroll">
        <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
          {meta.description}
        </p>
        {own.length > 0 && (
          <ul className="space-y-1">
            {own.map((problem, index) => (
              <li key={index} className={`text-[12px] px-2 py-1 rounded ${problem.severity === 'error' ? 'problem-error' : 'problem-warning'}`}>
                {problem.message}
              </li>
            ))}
          </ul>
        )}

        {node.type !== 'start' && (
          <p className="text-[11.5px] -mt-2" style={{ color: 'var(--muted)' }}>
            The heading is the name above; in the file this node is <code>## {node.id}. {meta.keyword}: {node.name || meta.namePlaceholder}</code>.
          </p>
        )}

        <ConfigFields node={node} onChange={(config: Record<string, ConfigValue>) => patch({ config })} />

        {node.type === 'switch' && (
          <div>
            <div className="section-title">Cases · one arrow each, plus "default"</div>
            <ListField
              values={asList(node.config['cases'])}
              placeholder="pdf"
              addLabel="Add case"
              onChange={(cases) => patch({ config: { ...node.config, cases: cases.map((label) => label.trim()).filter((label, index, all) => label && all.indexOf(label) === index) } })}
            />
          </div>
        )}

        {meta.caution && (
          <div className="caution" role="note">
            <TriangleAlert size={15} className="shrink-0" style={{ marginTop: 1 }} />
            <span>{meta.caution}</span>
          </div>
        )}

        {meta.hasBody && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="section-title" style={{ marginBottom: 0 }}>{meta.bodyLabel}</span>
              {node.type === 'code' && (
                <button
                  className="btn"
                  onClick={runTest}
                  disabled={testing || !node.body.trim() || !hasSandbox}
                  title={hasSandbox ? 'Run this code in the sandbox' : 'Needs the local server (./run.sh); the static build has no sandbox'}
                >
                  <Play size={12} /> {testing ? 'Running…' : 'Test'}
                </button>
              )}
            </div>
            <CodeEditor
              ref={editor}
              value={node.body}
              onChange={(body) => patch({ body })}
              language={language}
              refNames={refNames}
              placeholder={meta.bodyPlaceholder}
              minHeight={node.type === 'code' ? 180 : 140}
            />
            {node.type === 'code' && (
              <div className="mt-2 space-y-1">
                <div className="label">Test input (JSON on stdin)</div>
                <textarea className="field" rows={2} value={testInput} onChange={(event) => setTestInput(event.target.value)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                {testResult && (
                  <pre className="field scroll" style={{ maxHeight: 160, fontSize: 11.5, whiteSpace: 'pre-wrap', background: 'var(--panel-2)' }}>
                    {testResult.timedOut ? `Timed out after ${testResult.limits.timeoutSeconds}s` : `exit ${testResult.exitStatus} · ${testResult.durationMs}ms`}
                    {testResult.stdout ? `\n${testResult.stdout}` : ''}
                    {testResult.stderr ? `\n[stderr]\n${testResult.stderr}` : ''}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {meta.hasBody && !meta.fence && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="section-title" style={{ marginBottom: 0 }}>Stages</span>
              <button className="btn" onClick={() => setStages([...node.stages, { id: '', name: `Stage ${node.stages.length + 1}`, body: '' }])}>
                Add stage
              </button>
            </div>
            {node.stages.length === 0 && (
              <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
                Optional numbered sub-steps ({node.id}.1, {node.id}.2 …) for a long instruction.
              </p>
            )}
            <div className="space-y-2">
              {node.stages.map((stage, index) => (
                <div key={stage.id || index} className="rounded-lg border p-2 space-y-1" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex gap-1 items-center">
                    <span className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>
                      {node.id}.{index + 1}
                    </span>
                    <input className="field" value={stage.name} placeholder="Stage name" onChange={(event) => setStages(node.stages.map((item, position) => (position === index ? { ...item, name: event.target.value } : item)))} />
                    <button className="btn icon" title="Remove stage" onClick={() => setStages(node.stages.filter((_item, position) => position !== index))}>
                      <X size={12} />
                    </button>
                  </div>
                  <textarea className="field" rows={2} value={stage.body} placeholder="What to do in this stage" onChange={(event) => setStages(node.stages.map((item, position) => (position === index ? { ...item, body: event.target.value } : item)))} />
                </div>
              ))}
            </div>
          </div>
        )}

        {node.type !== 'start' && (
          <div>
            <div className="section-title">Connected nodes</div>
            <p className="text-[12px] mb-1" style={{ color: 'var(--muted)' }}>
              Drag a chip into the text, or click it, to reference that node's result.
            </p>
            <div className="flex flex-wrap gap-1">
              {upstream.length === 0 && (
                <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
                  Nothing leads here yet.
                </span>
              )}
              {upstream.map((candidate) => (
                <RefChip key={candidate.id} id={candidate.id} name={candidate.name} onInsert={insertRef} />
              ))}
              <RefChip id="input" name="what the caller passed in" onInsert={() => editor.current?.insert('${input}')} />
            </div>
            {others.length > 0 && (
              <details className="mt-2">
                <summary className="text-[12px] cursor-pointer" style={{ color: 'var(--muted)' }}>
                  Other nodes ({others.length})
                </summary>
                <div className="flex flex-wrap gap-1 mt-1">
                  {others.map((candidate) => (
                    <RefChip key={candidate.id} id={candidate.id} name={candidate.name} onInsert={insertRef} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div>
          <button className="flex items-center gap-1 section-title" onClick={() => setShowMarkdown((value) => !value)}>
            {showMarkdown ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Markdown for this node
          </button>
          {showMarkdown && (
            <pre className="field scroll mt-1" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', background: 'var(--panel-2)', maxHeight: 240 }}>
              {serializeNodeMarkdown(skill, node)}
            </pre>
          )}
        </div>
      </div>
    </aside>
  );
}

function RefChip({ id, name, onInsert }: { id: number | string; name: string; onInsert: (id: number, name: string) => void }) {
  const text = typeof id === 'number' ? makeRef(id, name) : `\${${id}}`;
  return (
    <span
      className="chip"
      draggable
      title={`Insert ${text}`}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', text);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => (typeof id === 'number' ? onInsert(id, name) : onInsert(0, name))}
    >
      <span className="font-mono">{typeof id === 'number' ? id : 'in'}</span>
      <span className="font-normal">{name}</span>
    </span>
  );
}
