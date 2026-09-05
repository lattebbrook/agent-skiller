/**
 * Canvas preferences that belong to the person, not to the skill, so they live
 * in localStorage rather than in the document. Updates broadcast on a window
 * event, keeping every mounted consumer in step without a global store.
 */
import { useCallback, useEffect, useState } from 'react';

export type EdgeStyle = 'curved' | 'orthogonal';
export type PaletteDensity = 'relax' | 'normal' | 'compact';

export interface CanvasPrefs {
  edgeStyle: EdgeStyle;
  paletteDensity: PaletteDensity;
  /** Group ids the person folded shut in the palette. */
  paletteCollapsed: string[];
}

const STORAGE_KEY = 'skiller.canvasPrefs';
const EVENT = 'skiller:canvas-prefs';
const DEFAULTS: CanvasPrefs = { edgeStyle: 'curved', paletteDensity: 'normal', paletteCollapsed: [] };

export function readCanvasPrefs(): CanvasPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<CanvasPrefs>;
    return {
      edgeStyle: parsed.edgeStyle === 'orthogonal' ? 'orthogonal' : 'curved',
      paletteDensity: parsed.paletteDensity === 'relax' || parsed.paletteDensity === 'compact' ? parsed.paletteDensity : 'normal',
      paletteCollapsed: Array.isArray(parsed.paletteCollapsed) ? parsed.paletteCollapsed.filter((id): id is string => typeof id === 'string') : [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeCanvasPrefs(patch: Partial<CanvasPrefs>): void {
  const next = { ...readCanvasPrefs(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing or a full quota: the value still applies to this page.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useCanvasPrefs(): [CanvasPrefs, (patch: Partial<CanvasPrefs>) => void] {
  const [prefs, setPrefs] = useState<CanvasPrefs>(readCanvasPrefs);
  useEffect(() => {
    const sync = () => setPrefs(readCanvasPrefs());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const update = useCallback((patch: Partial<CanvasPrefs>) => writeCanvasPrefs(patch), []);
  return [prefs, update];
}
