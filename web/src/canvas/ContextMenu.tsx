import { useEffect, useRef, type ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  danger?: boolean;
  /** Extra class, e.g. 'wand' for the generate entry. */
  className?: string;
  disabled?: boolean;
  run: () => void;
}

/** Right-click menu, positioned at the pointer and kept inside the window. */
export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const left = Math.min(at.x, window.innerWidth - rect.width - 8);
    const top = Math.min(at.y, window.innerHeight - rect.height - 8);
    element.style.left = `${Math.max(8, left)}px`;
    element.style.top = `${Math.max(8, top)}px`;
  }, [at, items.length]);

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose} onContextMenu={(event) => { event.preventDefault(); onClose(); }}>
      <div ref={ref} className="menu context-menu" style={{ left: at.x, top: at.y }} onMouseDown={(event) => event.stopPropagation()} role="menu">
        {items.map((item) => (
          <button
            key={item.id}
            role="menuitem"
            className={[item.danger ? 'danger' : '', item.className ?? ''].filter(Boolean).join(' ')}
            disabled={item.disabled}
            onClick={() => {
              item.run();
              onClose();
            }}
          >
            <span className="menu-icon">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.hint && <span className="menu-hint">{item.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
