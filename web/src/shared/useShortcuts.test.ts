import { describe, expect, it } from 'vitest';
import { matchesCombo } from './useShortcuts.js';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('matchesCombo', () => {
  it('matches plain keys and alternates', () => {
    expect(matchesCombo('s', key({ key: 's' }))).toBe(true);
    expect(matchesCombo('backspace|delete', key({ key: 'Delete' }))).toBe(true);
    expect(matchesCombo('s', key({ key: 's', metaKey: true }))).toBe(false);
  });
  it('requires exact modifiers', () => {
    expect(matchesCombo('mod+z', key({ key: 'z', metaKey: true }))).toBe(true);
    expect(matchesCombo('mod+z', key({ key: 'z', ctrlKey: true }))).toBe(true);
    expect(matchesCombo('mod+z', key({ key: 'z', metaKey: true, shiftKey: true }))).toBe(false);
    expect(matchesCombo('mod+shift+z', key({ key: 'z', metaKey: true, shiftKey: true }))).toBe(true);
  });
});
