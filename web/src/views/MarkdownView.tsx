/**
 * The skill as Markdown. Read-only while it follows the canvas; press Edit to
 * change the text and Apply to turn it back into nodes.
 */
import { useEffect, useMemo, useState } from 'react';
import { importText, serializeMarkdown } from '@agent-skiller/core';
import { CodeEditor } from '../drawer/CodeEditor.js';
import { useSkillStore } from '../store/skillStore.js';
import { useToast } from '../shared/Toast.js';

export function MarkdownView() {
  const skill = useSkillStore((state) => state.skill);
  const replaceSkill = useSkillStore((state) => state.replaceSkill);
  const toast = useToast();
  const markdown = useMemo(() => (skill ? serializeMarkdown(skill) : ''), [skill]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(markdown);
  const refNames = useMemo(() => Object.fromEntries((skill?.nodes ?? []).map((node) => [node.id, node.name])) as Record<number, string>, [skill]);

  useEffect(() => {
    if (!editing) setDraft(markdown);
  }, [markdown, editing]);

  if (!skill) return null;

  const apply = () => {
    try {
      const imported = importText(draft, 'edited.md');
      const errors = imported.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
      if (errors.length) {
        toast.show(errors.map((error) => error.message).join(' '), 'error');
        return;
      }
      replaceSkill({ ...imported.skill, layout: Object.keys(imported.skill.layout).length ? imported.skill.layout : skill.layout });
      setEditing(false);
      toast.show('Markdown applied to the canvas.');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: 'var(--line)' }}>
        <span className="text-[12px]" style={{ color: 'var(--muted)' }}>
          {editing ? 'Editing the file directly. Apply turns it back into nodes.' : 'This is exactly what gets saved and exported.'}
        </span>
        <span className="flex-1" />
        {editing ? (
          <>
            <button className="btn outline" onClick={() => { setEditing(false); setDraft(markdown); }}>
              Cancel
            </button>
            <button className="btn primary" onClick={apply}>
              Apply
            </button>
          </>
        ) : (
          <>
            <button className="btn outline" onClick={() => void navigator.clipboard.writeText(markdown).then(() => toast.show('Markdown copied.'))}>
              Copy
            </button>
            <button className="btn outline" onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
      </div>
      <div className="flex-1 scroll p-3">
        {editing ? (
          <CodeEditor value={draft} onChange={setDraft} language="markdown" refNames={refNames} minHeight={400} maxHeight={100000} autoFocus />
        ) : (
          <pre className="field" style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5 }}>
            {markdown}
          </pre>
        )}
      </div>
    </div>
  );
}
