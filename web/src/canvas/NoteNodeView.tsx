import { memo, useEffect, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useSkillStore } from '../store/skillStore.js';
import type { NoteFlowNode } from './flowMapping.js';

export const NoteNodeView = memo(function NoteNodeView({ data, selected }: NodeProps<NoteFlowNode>) {
  const updateNote = useSkillStore((state) => state.updateNote);
  const [editing, setEditing] = useState(data.text === '');
  const [draft, setDraft] = useState(data.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(data.text);
  }, [data.text, editing]);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const finish = () => {
    setEditing(false);
    if (draft !== data.text) updateNote(data.noteId, { text: draft });
  };

  return (
    <div className={`note-node${selected ? ' selected' : ''}`} onDoubleClick={() => setEditing(true)} title={data.attachedTo ? `Note on step ${data.attachedTo}` : 'Note'}>
      {editing ? (
        <textarea
          ref={ref}
          className="nodrag nowheel"
          value={draft}
          placeholder="Write a note…"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              finish();
            }
            event.stopPropagation();
          }}
        />
      ) : (
        <div>{data.text || <span style={{ color: 'var(--muted)' }}>Double-click to write</span>}</div>
      )}
      {data.attachedTo !== null && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>on step {data.attachedTo}</div>}
    </div>
  );
});
