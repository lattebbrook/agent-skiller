const ROWS: [string, string][] = [
  ['S / H', 'Select tool / hand tool (hold Space to pan)'],
  ['Tab or double-click', 'Add a node'],
  ['Right-click', 'Menu for the canvas, a node, an arrow, or a file'],
  ['Right-click empty canvas', 'Generate steps with AI'],
  ['N', 'Add a note at the cursor'],
  ['Drag an arrow into empty space', 'Add a connected node'],
  ['Hover an arrow', 'Shows its delete button'],
  ['Enter / Esc', 'Open / close the node editor'],
  ['Backspace', 'Delete selection (arrows re-join through)'],
  ['⌘Z / ⌘⇧Z', 'Undo / redo'],
  ['⌘C / ⌘V / ⌘D', 'Copy / paste / duplicate'],
  ['⌘A', 'Select all'],
  ['⌘S', 'Save now (autosave is always on)'],
  ['⌘E', 'Export'],
  ['⌘L', 'Auto-layout'],
  ['F / 1', 'Fit view / zoom to 100%'],
  ['⌘⇧L', 'Switch theme (system / light / dark)'],
  ['⌘,', 'Settings'],
  ['?', 'This sheet'],
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay fixed inset-0 z-50 grid place-items-center" onMouseDown={onClose}>
      <div className="rounded-xl p-5 w-[460px]" style={{ background: 'var(--panel)', boxShadow: 'var(--shadow)' }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="font-semibold mb-3">Keyboard shortcuts</div>
        <table className="w-full text-[12.5px]">
          <tbody>
            {ROWS.map(([keys, what]) => (
              <tr key={keys}>
                <td className="py-1 pr-3 whitespace-nowrap">
                  <span className="kbd">{keys}</span>
                </td>
                <td className="py-1" style={{ color: 'var(--muted)' }}>
                  {what}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
