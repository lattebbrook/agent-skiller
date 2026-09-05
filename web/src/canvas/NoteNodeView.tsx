import { memo, useEffect, useRef, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { NOTE_COLORS, type NoteColor } from '@agent-skiller/core';
import { useSkillStore } from '../store/skillStore.js';
import type { NoteFlowNode } from './flowMapping.js';

const SWATCH: Record<NoteColor, string> = {
  yellow: '#f3dd7a',
  blue: '#7fa8e6',
  green: '#7cc48d',
  pink: '#e58ab0',
  purple: '#b596e8',
  orange: '#f0a862',
  red: '#e58a86',
  gray: '#b3b3ba',
};

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
    <div className={`note-node${selected ? ' selected' : ''}`} data-color={data.color || undefined} onDoubleClick={() => setEditing(true)} title={data.attachedTo ? `Note on step ${data.attachedTo}` : 'Note'}>
      {selected && !editing && (
        <div className="note-swatches nodrag nopan" role="radiogroup" aria-label="Note colour">
          {NOTE_COLORS.map((color) => (
            <button
              key={color}
              className={`note-swatch${(data.color || NOTE_COLORS[0]) === color ? ' active' : ''}`}
              style={{ background: SWATCH[color] }}
              title={color}
              aria-label={color}
              onClick={(event) => {
                event.stopPropagation();
                updateNote(data.noteId, { color: color === NOTE_COLORS[0] ? '' : color });
              }}
            />
          ))}
        </div>
      )}
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
