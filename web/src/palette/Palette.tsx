/**
 * The node palette: kinds grouped by what you are trying to do, each group a
 * fold-down, at a density you pick. Drag a row onto the canvas or click to add.
 */
import { NODE_GROUPS, NODE_META, PALETTE, type PaletteEntry } from '@agent-skiller/core';
import { ChevronDown, ChevronRight, Rows3, Rows4, LayoutList } from 'lucide-react';
import { NodeIcon, NOTE_ICON as NoteIcon } from '../canvas/nodeIcons.js';
import { useCanvasPrefs, type PaletteDensity } from '../canvas/prefs.js';

export const DRAG_MIME = 'application/agent-skiller-node';

const DENSITIES: { id: PaletteDensity; label: string; icon: typeof Rows3 }[] = [
  { id: 'relax', label: 'Relaxed', icon: LayoutList },
  { id: 'normal', label: 'Normal', icon: Rows3 },
  { id: 'compact', label: 'Compact', icon: Rows4 },
];

export function Palette({ onAdd, onAddNote, hasStart }: { onAdd: (entry: PaletteEntry) => void; onAddNote: () => void; hasStart: boolean }) {
  const [prefs, setPrefs] = useCanvasPrefs();
  const density = prefs.paletteDensity;
  const collapsed = new Set(prefs.paletteCollapsed);
  const toggle = (id: string) => setPrefs({ paletteCollapsed: collapsed.has(id) ? prefs.paletteCollapsed.filter((item) => item !== id) : [...prefs.paletteCollapsed, id] });
  const iconSize = density === 'compact' ? 20 : density === 'relax' ? 32 : 26;

  return (
    <div className={`palette density-${density}`}>
      <div className="palette-head">
        <span className="muted-text">
          Drag onto the canvas, or click. <span className="kbd">Tab</span> on the canvas does the same.
        </span>
        <div className="segmented tiny" role="radiogroup" aria-label="Palette density">
          {DENSITIES.map((option) => (
            <button key={option.id} className={density === option.id ? 'active' : ''} title={option.label} aria-label={option.label} onClick={() => setPrefs({ paletteDensity: option.id })}>
              <option.icon size={13} />
            </button>
          ))}
        </div>
      </div>

      {NODE_GROUPS.map((group) => {
        const entries = PALETTE.filter((entry) => entry.group === group.id);
        const open = !collapsed.has(group.id);
        return (
          <section key={group.id} className="palette-group">
            <button className="palette-group-head" onClick={() => toggle(group.id)} aria-expanded={open}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="palette-group-title">{group.label}</span>
              {density !== 'compact' && <span className="palette-group-desc">{group.description}</span>}
              {!open && <span className="palette-group-count">{entries.length}</span>}
            </button>
            {open && (
              <div className="card-list">
                {entries.map((entry) => {
                  const disabled = entry.type === 'start' && hasStart;
                  return (
                    <button
                      key={entry.id}
                      className="card"
                      draggable={!disabled}
                      disabled={disabled}
                      title={disabled ? 'A skill has one Start' : entry.description}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_MIME, entry.id);
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => onAdd(entry)}
                    >
                      <NodeIcon type={entry.type} size={iconSize} color={NODE_META[entry.type].color} />
                      <span className="min-w-0">
                        <span className="card-title">{entry.label}</span>
                        {density !== 'compact' && <span className="card-desc">{entry.description}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <section className="palette-group">
        <div className="palette-group-head static">
          <span className="palette-group-title">Notes</span>
          {density !== 'compact' && <span className="palette-group-desc">For the people reading the file.</span>}
        </div>
        <div className="card-list">
          <button
            className="card"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_MIME, 'note');
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={onAddNote}
            title="A sticky note for humans reading the skill (N)"
          >
            <span className="node-icon note-icon" style={{ width: iconSize, height: iconSize, borderRadius: Math.round(iconSize * 0.29) }}>
              <NoteIcon size={Math.round(iconSize * 0.58)} strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="card-title">Note</span>
              {density !== 'compact' && <span className="card-desc">Sticky note, exported as a quote. Eight colours.</span>}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
