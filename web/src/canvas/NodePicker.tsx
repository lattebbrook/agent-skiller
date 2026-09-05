import { useEffect, useMemo, useRef, useState } from 'react';
import { NODE_META, PALETTE, type PaletteEntry } from '@agent-skiller/core';
import { NodeIcon, NOTE_ICON as NoteIcon } from './nodeIcons.js';

export type PickerChoice = { kind: 'node'; entry: PaletteEntry } | { kind: 'note' };

/** The searchable node list (Tab, double-click, or dropping an arrow on empty canvas). */
export function NodePicker({ at, onPick, onClose, includeStart }: { at: { x: number; y: number }; onPick: (choice: PickerChoice) => void; onClose: () => void; includeStart: boolean }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const list = PALETTE.filter((entry) => includeStart || entry.type !== 'start');
    const matches = lower ? list.filter((entry) => `${entry.label} ${entry.description} ${entry.type}`.toLowerCase().includes(lower)) : list;
    const choices: PickerChoice[] = matches.map((entry) => ({ kind: 'node', entry }));
    if (!lower || 'note sticky'.includes(lower)) choices.push({ kind: 'note' });
    return choices;
  }, [query, includeStart]);

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    setIndex(0);
  }, [query]);

  const width = 280;
  const left = Math.min(at.x, window.innerWidth - width - 12);
  const top = Math.min(at.y, window.innerHeight - 360);

  return (
    <div className="fixed inset-0 z-40" onMouseDown={onClose}>
      <div
        className="absolute rounded-xl border overflow-hidden"
        style={{ left, top, width, background: 'var(--panel)', borderColor: 'var(--line)', boxShadow: 'var(--shadow)' }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Add node"
      >
        <input
          ref={input}
          className="w-full px-3 py-2 outline-none border-b"
          style={{ borderColor: 'var(--line)', background: 'transparent' }}
          placeholder="Add a node…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIndex((current) => Math.min(current + 1, entries.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const choice = entries[index];
              if (choice) onPick(choice);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
            event.stopPropagation();
          }}
        />
        <div className="scroll" style={{ maxHeight: 300 }}>
          {entries.map((choice, position) => {
            const active = position === index;
            const label = choice.kind === 'note' ? 'Note' : choice.entry.label;
            const description = choice.kind === 'note' ? 'A sticky note for humans reading the skill.' : choice.entry.description;
            return (
              <button
                key={label}
                className="w-full text-left px-3 py-2 flex items-center gap-3"
                style={{ background: active ? 'var(--accent-soft)' : 'transparent' }}
                onMouseEnter={() => setIndex(position)}
                onClick={() => onPick(choice)}
              >
                {choice.kind === 'note' ? (
                  <span className="node-icon note-icon shrink-0" style={{ width: 26, height: 26, borderRadius: 8 }}>
                    <NoteIcon size={15} strokeWidth={2} />
                  </span>
                ) : (
                  <NodeIcon type={choice.entry.type} size={26} color={NODE_META[choice.entry.type].color} />
                )}
                <span className="min-w-0">
                  <span className="font-semibold">{label}</span>
                  <span className="block text-[11px] truncate" style={{ color: 'var(--muted)' }}>
                    {description}
                  </span>
                </span>
              </button>
            );
          })}
          {entries.length === 0 && (
            <div className="px-3 py-3 text-[12px]" style={{ color: 'var(--muted)' }}>
              Nothing matches.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
