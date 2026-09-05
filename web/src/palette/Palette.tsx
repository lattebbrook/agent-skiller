import { NODE_META, PALETTE, type PaletteEntry } from '@agent-skiller/core';
import { NodeIcon, NOTE_ICON as NoteIcon } from '../canvas/nodeIcons.js';

export const DRAG_MIME = 'application/agent-skiller-node';

/** Left-hand list of node kinds: click to add at the viewport centre, drag onto the canvas. */
export function Palette({ onAdd, onAddNote, hasStart }: { onAdd: (entry: PaletteEntry) => void; onAddNote: () => void; hasStart: boolean }) {
  return (
    <div className="card-list">
      <p className="px-1 pb-1 text-[11.5px]" style={{ color: 'var(--muted)' }}>
        Drag onto the canvas, or click to add. <span className="kbd">Tab</span> on the canvas does the same.
      </p>
      {PALETTE.map((entry) => {
        const disabled = entry.type === 'start' && hasStart;
        return (
          <button
            key={entry.id}
            className="card"
            style={{ ['--card-color' as string]: NODE_META[entry.type].color }}
            draggable={!disabled}
            disabled={disabled}
            title={disabled ? 'A skill has one Start' : entry.description}
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_MIME, entry.id);
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onAdd(entry)}
          >
            <NodeIcon type={entry.type} size={28} color={NODE_META[entry.type].color} />
            <span className="min-w-0">
              <span className="card-title">{entry.label}</span>
              <span className="card-desc">{entry.description}</span>
            </span>
          </button>
        );
      })}
      <button
        className="card"
        style={{ ['--card-color' as string]: 'var(--note-line)' }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_MIME, 'note');
          event.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={onAddNote}
        title="A sticky note for humans reading the skill (N)"
      >
        <span className="node-icon note-icon" style={{ width: 28, height: 28, borderRadius: 8 }}>
          <NoteIcon size={16} strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="card-title">Note</span>
          <span className="card-desc">Sticky note, exported as a quote.</span>
        </span>
      </button>
    </div>
  );
}
