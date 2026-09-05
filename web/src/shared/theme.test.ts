import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, nextThemePreference, readThemePreference, resolveTheme, setThemePreference } from './theme.js';

describe('theme', () => {
  beforeEach(() => {
    localStorage.removeItem('skiller.theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system and resolves it from the media query', () => {
    expect(readThemePreference()).toBe('system');
    expect(['light', 'dark']).toContain(resolveTheme('system'));
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('cycles system → light → dark → system', () => {
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });

  it('persists the choice and stamps data-theme on the root', () => {
    setThemePreference('dark');
    expect(localStorage.getItem('skiller.theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    setThemePreference('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    setThemePreference('system');
    expect(localStorage.getItem('skiller.theme')).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('applyTheme works on any root element', () => {
    const root = document.createElement('div');
    applyTheme('light', root);
    expect(root.getAttribute('data-theme')).toBe('light');
    applyTheme('system', root);
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
