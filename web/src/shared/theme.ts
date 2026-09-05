/**
 * Theme preference: 'system' (follow the OS), 'light' or 'dark'. Stored in
 * localStorage and applied as data-theme on <html>, which the tokens in
 * styles.css key off. 'system' removes the attribute so the media query rules.
 */
import { useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'skiller.theme';
const EVENT = 'skiller:theme';
const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

export function readThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement): void {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the choice still applies for this page.
  }
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;
}

/** Call once at startup so the first paint already has the right palette. */
export function initTheme(): void {
  applyTheme(readThemePreference());
}

export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme; set: (preference: ThemePreference) => void; cycle: () => void } {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readThemePreference()));

  useEffect(() => {
    const sync = () => {
      const current = readThemePreference();
      setPreference(current);
      setResolved(resolveTheme(current));
    };
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    media?.addEventListener?.('change', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
      media?.removeEventListener?.('change', sync);
    };
  }, []);

  return {
    preference,
    resolved,
    set: setThemePreference,
    cycle: () => setThemePreference(nextThemePreference(preference)),
  };
}
