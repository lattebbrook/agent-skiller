/**
 * The node palette, laid out like the workspace explorer: each group is a
 * folder row with a chevron, each kind an indented row with its icon. Two
 * densities: normal shows a short description beside the name, compact shows
 * the name alone. Drag a row onto the canvas or click to add.
 */
import { NODE_GROUPS, NODE_META, PALETTE, type PaletteEntry } from '@agent-skiller/core';
import { ChevronDown, ChevronRight, Rows3, Rows4 } from 'lucide-react';
import { NodeIcon, NOTE_ICON as NoteIcon } from '../canvas/nodeIcons.js';
import { useCanvasPrefs } from '../canvas/prefs.js';

export const DRAG_MIME = 'application/agent-skiller-node';

export function Palette({ onAdd, onAddNote, hasStart }: { onAdd: (entry: PaletteEntry) => void; onAddNote: () => void; hasStart: boolean }) {
  const [prefs, setPrefs] = useCanvasPrefs();
  const compact = prefs.paletteDensity === 'compact';
  const collapsed = new Set(prefs.paletteCollapsed);
  const toggle = (id: string) => setPrefs({ paletteCollapsed: collapsed.has(id) ? prefs.paletteCollapsed.filter((item) => item !== id) : [...prefs.paletteCollapsed, id] });
  const iconSize = compact ? 16 : 18;

  return (
    <div className={`palette tree density-${prefs.paletteDensity}`}>
      <div className="toolbar" style={{ paddingTop: 2 }}>
        <span className="muted-text flex-1" style={{ fontSize: 11.5 }}>
          Drag onto the canvas, or click. <span className="kbd">Tab</span> does the same.
        </span>
        <button
          className="btn icon"
          title={compact ? 'Compact rows. Click for normal.' : 'Normal rows. Click for compact.'}
          aria-label="Toggle palette density"
          onClick={() => setPrefs({ paletteDensity: compact ? 'normal' : 'compact' })}
        >
          {compact ? <Rows4 size={15} /> : <Rows3 size={15} />}
        </button>
      </div>

      {NODE_GROUPS.map((group) => {
        const entries = PALETTE.filter((entry) => entry.group === group.id);
        const open = !collapsed.has(group.id);
        return (
          <div key={group.id}>
            <button type="button" className="tree-row palette-folder" style={{ paddingLeft: 6 }} onClick={() => toggle(group.id)} aria-expanded={open} title={group.description}>
              {open ? <ChevronDown size={13} className="chev" /> : <ChevronRight size={13} className="chev" />}
              <span className="flex-1 truncate">{group.label}</span>
              {!open && <span className="palette-group-count">{entries.length}</span>}
            </button>
            {open &&
              entries.map((entry) => {
                const disabled = entry.type === 'start' && hasStart;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`tree-row palette-item${disabled ? ' disabled' : ''}`}
                    style={{ paddingLeft: 6 + 14 }}
                    disabled={disabled}
                    draggable={!disabled}
                    title={disabled ? 'A skill has one Start' : entry.description}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(DRAG_MIME, entry.id);
                      event.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onAdd(entry)}
                  >
                    <span style={{ width: 12 }} />
                    <NodeIcon type={entry.type} size={iconSize} color={NODE_META[entry.type].color} />
                    <span className="palette-item-name">{entry.label}</span>
                    {!compact && <span className="palette-item-desc truncate">{entry.description}</span>}
                  </button>
                );
              })}
          </div>
        );
      })}

      <div>
        <div className="tree-row palette-folder static" style={{ paddingLeft: 6 }} title="For the people reading the file.">
          <span style={{ width: 13 }} />
          <span className="flex-1 truncate">Notes</span>
        </div>
        <button
          type="button"
          className="tree-row palette-item"
          style={{ paddingLeft: 6 + 14 }}
          draggable
          title="A sticky note for humans reading the skill (N). Eight colours."
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_MIME, 'note');
            event.dataTransfer.effectAllowed = 'copy';
          }}
          onClick={onAddNote}
        >
          <span style={{ width: 12 }} />
          <span className="node-icon note-icon" style={{ width: iconSize, height: iconSize, borderRadius: Math.round(iconSize * 0.29) }}>
            <NoteIcon size={Math.round(iconSize * 0.6)} strokeWidth={2} />
          </span>
          <span className="palette-item-name">Note</span>
          {!compact && <span className="palette-item-desc truncate">Sticky note, exported as a quote.</span>}
        </button>
      </div>
    </div>
  );
}
