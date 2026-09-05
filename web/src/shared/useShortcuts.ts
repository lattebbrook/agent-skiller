import { useEffect, useRef } from 'react';

/**
 * Declarative keyboard shortcuts.
 * Combo grammar: `mod+shift+k`, `s`, `Backspace|Delete`. `mod` is ⌘ on macOS and Ctrl elsewhere.
 */
export interface ShortcutBinding {
  combo: string;
  run: (event: KeyboardEvent) => void | Promise<void>;
  when?: () => boolean;
  allowInEditable?: boolean;
  preventDefault?: boolean;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true;
}

export function hasTextSelection(): boolean {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
}

export function matchesCombo(combo: string, event: KeyboardEvent): boolean {
  return combo.split('|').some((alternate) => {
    const parts = alternate.trim().toLowerCase().split('+');
    const key = parts[parts.length - 1] ?? '';
    const wantsMod = parts.includes('mod');
    const wantsShift = parts.includes('shift');
    const wantsAlt = parts.includes('alt');
    if (wantsMod !== (event.metaKey || event.ctrlKey)) return false;
    if (wantsShift !== event.shiftKey) return false;
    if (wantsAlt !== event.altKey) return false;
    return event.key.toLowerCase() === key;
  });
}

export function useShortcuts(bindings: ShortcutBinding[], enabled = true): void {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);
      for (const binding of ref.current) {
        if (!matchesCombo(binding.combo, event)) continue;
        if (editable && !binding.allowInEditable) continue;
        if (binding.when && !binding.when()) continue;
        if (binding.preventDefault !== false) event.preventDefault();
        void binding.run(event);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
