import { beforeEach, describe, expect, it } from 'vitest';
import { clearDraft, hasDraft, readDraft, writeDraft } from './generateDraft.js';

beforeEach(() => {
  clearDraft();
});

describe('generate draft', () => {
  it('starts empty and reports nothing worth keeping', () => {
    expect(readDraft().prompt).toBe('');
    expect(hasDraft()).toBe(false);
  });

  it('keeps what was typed across reads, as the dialog closing and reopening would', () => {
    writeDraft({ prompt: 'tidy my desktop', operation: 'files', mode: 'steps' });
    expect(readDraft()).toMatchObject({ prompt: 'tidy my desktop', operation: 'files', mode: 'steps' });
    expect(hasDraft()).toBe(true);
  });

  it('persists the text fields but not attachments or results', () => {
    writeDraft({
      prompt: 'p',
      attachments: [{ name: 'a.png', mimeType: 'image/png', data: 'AAAA' }],
      result: { markdown: '#', skill: {} as never, problems: [], repaired: false, model: 'm' },
    });
    const stored = JSON.parse(localStorage.getItem('skiller.generateDraft') ?? '{}') as Record<string, unknown>;
    expect(stored['prompt']).toBe('p');
    expect(stored['attachments']).toBeUndefined();
    expect(stored['result']).toBeUndefined();
  });

  it('counts attachments and a result as worth keeping even with no prompt', () => {
    writeDraft({ attachments: [{ name: 'a.png', mimeType: 'image/png', data: 'AAAA' }] });
    expect(hasDraft()).toBe(true);
  });

  it('only Clear empties it, storage included', () => {
    writeDraft({ prompt: 'x', attachments: [{ name: 'a.png', mimeType: 'image/png', data: 'AAAA' }] });
    clearDraft();
    expect(hasDraft()).toBe(false);
    expect(readDraft().attachments).toEqual([]);
    expect(localStorage.getItem('skiller.generateDraft')).toBeNull();
  });
});
