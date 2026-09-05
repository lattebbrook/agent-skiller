/**
 * "Generate with AI": describe the job, say what kind of operation it is, and
 * attach screenshots so the model names the real buttons. What comes back is
 * parsed and validated by the same code that opens a file, and shown for
 * review before anything touches the canvas.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, RotateCcw, Sparkles, WandSparkles, X } from 'lucide-react';
import { serializeMarkdown, type Skill } from '@agent-skiller/core';
import type { Attachment, GenerateResult } from '../api.js';
import { ai } from '../ai.js';
import { useSkillStore } from '../store/skillStore.js';
import { clearDraft, hasDraft, readDraft, writeDraft } from './generateDraft.js';
import { useToast } from '../shared/Toast.js';

const OPERATIONS = [
  { id: 'computer use', label: 'Computer use', hint: 'Clicking around an app on screen.' },
  { id: 'browser', label: 'Browser', hint: 'Navigating a website or a web app.' },
  { id: 'files', label: 'Files and folders', hint: 'Finding, sorting, renaming, moving.' },
  { id: 'data', label: 'Data', hint: 'Reading, checking or transforming records.' },
  { id: 'writing', label: 'Writing', hint: 'Drafting, summarising or replying.' },
  { id: 'research', label: 'Research', hint: 'Gathering and comparing information.' },
  { id: 'other', label: 'Something else', hint: 'Describe it fully below.' },
];

const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export function GenerateDialog({ onClose, onInsert }: { onClose: () => void; onInsert: (skill: Skill, mode: 'skill' | 'steps') => void }) {
  const current = useSkillStore((state) => state.skill);
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  // Everything below is mirrored into the draft, so closing the dialog — by
  // accident or on purpose — never costs the person what they typed.
  const draft = readDraft();
  const [prompt, setPromptState] = useState(draft.prompt);
  const [operation, setOperationState] = useState(draft.operation || OPERATIONS[0]!.id);
  const [attachments, setAttachmentsState] = useState<Attachment[]>(draft.attachments);
  const [mode, setModeState] = useState<'skill' | 'steps'>(draft.prompt ? draft.mode : current && current.nodes.length > 1 ? 'steps' : 'skill');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResultState] = useState<GenerateResult | null>(draft.result);
  const [confirmClear, setConfirmClear] = useState(false);
  const [restored] = useState(() => hasDraft());

  const setPrompt = (value: string) => {
    setPromptState(value);
    writeDraft({ prompt: value });
  };
  const setOperation = (value: string) => {
    setOperationState(value);
    writeDraft({ operation: value });
  };
  const setAttachments = (value: Attachment[]) => {
    setAttachmentsState(value);
    writeDraft({ attachments: value });
  };
  const setMode = (value: 'skill' | 'steps') => {
    setModeState(value);
    writeDraft({ mode: value });
  };
  const setResult = (value: GenerateResult | null) => {
    setResultState(value);
    writeDraft({ result: value });
  };

  const reset = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      window.setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    const empty = clearDraft();
    setPromptState(empty.prompt);
    setOperationState(OPERATIONS[0]!.id);
    setAttachmentsState([]);
    setModeState(current && current.nodes.length > 1 ? 'steps' : 'skill');
    setResultState(null);
    setError('');
    setConfirmClear(false);
    toast.show('Cleared.');
  };

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

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: Attachment[] = [...attachments];
    for (const file of [...files].slice(0, 6)) {
      const buffer = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
      next.push({ name: file.name, mimeType: file.type || 'text/plain', data: btoa(binary) });
    }
    const total = next.reduce((sum, file) => sum + Math.ceil((file.data.length * 3) / 4), 0);
    if (total > MAX_TOTAL_BYTES) {
      setError(`Attachments add up to more than ${MAX_TOTAL_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setError('');
    setAttachments(next.slice(0, 6));
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const generated = await ai.generate({
        prompt,
        operation,
        mode,
        context: mode === 'steps' && current ? serializeMarkdown(current) : '',
        attachments,
      });
      setResult(generated);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const insert = () => {
    if (!result) return;
    onInsert(result.skill, mode);
    toast.show(mode === 'steps' ? 'Steps added to the canvas.' : 'Skill replaced.');
    // The work landed on the canvas, so the draft has served its purpose.
    clearDraft();
    onClose();
  };

  const warnings = result?.problems.filter((problem) => problem.severity === 'warning') ?? [];
  const hasContent = prompt.trim().length > 0 || attachments.length > 0 || result !== null;

  return (
    /* No dismiss-on-backdrop here: a stray click used to wipe the prompt. */
    <div className="overlay fixed inset-0 z-50 grid place-items-center">
      <div className="settings-dialog generate-dialog" role="dialog" aria-label="Generate with AI">
        <header className="settings-head">
          <span className="wand-mark">
            <WandSparkles size={15} />
          </span>
          <span className="font-semibold text-[14px]">Generate with AI</span>
          <span className="flex-1" />
          <button className="btn icon" onClick={onClose} title="Close (Esc)" aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="settings-pane scroll flex-1">
          <div className="space-y-5">
            <div>
              <span className="section-title block">What kind of operation is this?</span>
              <div className="op-grid">
                {OPERATIONS.map((entry) => (
                  <button key={entry.id} className={`op-card${operation === entry.id ? ' active' : ''}`} onClick={() => setOperation(entry.id)}>
                    <span className="op-label">{entry.label}</span>
                    <span className="op-hint">{entry.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="section-title block">What should it do?</span>
              <textarea
                className="field w-full"
                rows={5}
                value={prompt}
                autoFocus
                placeholder={'Describe the job the way you would explain it to a new colleague.\n\nOpen the Mail app, read every unread message, and tell me in five lines what is new. If there is nothing unread, just say so.'}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="section-title" style={{ marginBottom: 0 }}>
                  Attachments
                </span>
                <span className="flex-1" />
                <button className="btn outline" onClick={() => fileInput.current?.click()}>
                  <Paperclip size={13} /> Add
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  multiple
                  accept="image/*,.txt,.md,.csv,.json"
                  onChange={(event) => void addFiles(event.target.files).then(() => (event.target.value = ''))}
                />
              </div>
              <p className="muted-text mb-2">Screenshots of the screen or the buttons to press, so the steps name the real controls. Text files are quoted as context.</p>
              {attachments.length > 0 && (
                <div className="attach-row">
                  {attachments.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="attach-chip">
                      {file.mimeType.startsWith('image/') ? (
                        <img src={`data:${file.mimeType};base64,${file.data}`} alt="" />
                      ) : (
                        <Paperclip size={12} />
                      )}
                      <span className="truncate max-w-[120px]">{file.name}</span>
                      <button onClick={() => setAttachments(attachments.filter((_item, position) => position !== index))} aria-label={`Remove ${file.name}`}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {current && (
              <div>
                <span className="section-title block">Where should it go?</span>
                <div className="segmented">
                  <button className={mode === 'steps' ? 'active' : ''} onClick={() => setMode('steps')}>
                    Add to this skill
                  </button>
                  <button className={mode === 'skill' ? 'active' : ''} onClick={() => setMode('skill')}>
                    Replace this skill
                  </button>
                </div>
              </div>
            )}

            {error && <div className="problem-error px-3 py-2 rounded text-[12px] whitespace-pre-wrap">{error}</div>}

            {result && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="section-title" style={{ marginBottom: 0 }}>
                    Result
                  </span>
                  <span className="muted-text">
                    {result.skill.nodes.length} steps · {result.model}
                    {result.repaired ? ' · corrected once' : ''}
                  </span>
                </div>
                {warnings.length > 0 && (
                  <ul className="space-y-1">
                    {warnings.slice(0, 4).map((problem, index) => (
                      <li key={index} className="problem-warning px-2 py-1 rounded text-[12px]">
                        {problem.nodeId ? `Step ${problem.nodeId}: ` : ''}
                        {problem.message}
                      </li>
                    ))}
                  </ul>
                )}
                <pre className="field scroll" style={{ maxHeight: 240, whiteSpace: 'pre-wrap', fontSize: 11.5, background: 'var(--panel-2)' }}>
                  {result.markdown}
                </pre>
              </div>
            )}
          </div>
        </div>

        <footer className="settings-foot">
          <span className="muted-text flex-1">
            {busy
              ? 'Writing the skill, then checking it opens…'
              : restored && hasContent
                ? 'Your last draft is still here. Closing keeps it; only Clear empties it.'
                : 'Nothing changes on the canvas until you insert it. Closing keeps what you typed.'}
          </span>
          <button
            className={`btn outline${confirmClear ? ' danger' : ''}`}
            onClick={reset}
            disabled={!hasContent}
            title="Empty the prompt, the attachments and the result"
          >
            <RotateCcw size={13} /> {confirmClear ? 'Clear everything?' : 'Clear'}
          </button>
          <button className="btn outline" onClick={onClose}>
            Cancel
          </button>
          {result ? (
            <>
              <button className="btn outline" onClick={generate} disabled={busy}>
                Try again
              </button>
              <button className="btn primary" onClick={insert}>
                <Sparkles size={14} /> {mode === 'steps' ? 'Add to canvas' : 'Replace skill'}
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={generate} disabled={busy || !prompt.trim()}>
              {busy ? <Loader2 size={14} className="spin" /> : <WandSparkles size={14} />} Generate
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
