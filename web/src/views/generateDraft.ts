/**
 * The Generate dialog's draft, kept outside the component so closing the
 * dialog never costs the person their work. The text fields also go to
 * localStorage, so they survive a reload; attachments and the last result stay
 * in memory only, because a few megabytes of base64 do not belong in storage.
 *
 * Only the Clear button empties this.
 */
import type { Attachment, GenerateResult } from '../api.js';

export interface GenerateDraft {
  prompt: string;
  operation: string;
  mode: 'skill' | 'steps';
  attachments: Attachment[];
  result: GenerateResult | null;
}

const STORAGE_KEY = 'skiller.generateDraft';

export const EMPTY_DRAFT: GenerateDraft = { prompt: '', operation: '', mode: 'skill', attachments: [], result: null };

function loadText(): Pick<GenerateDraft, 'prompt' | 'operation' | 'mode'> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<GenerateDraft>;
    return {
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
      operation: typeof parsed.operation === 'string' ? parsed.operation : '',
      mode: parsed.mode === 'steps' ? 'steps' : 'skill',
    };
  } catch {
    return { prompt: '', operation: '', mode: 'skill' };
  }
}

let draft: GenerateDraft = { ...EMPTY_DRAFT, ...loadText() };

export function readDraft(): GenerateDraft {
  return draft;
}

export function writeDraft(patch: Partial<GenerateDraft>): GenerateDraft {
  draft = { ...draft, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ prompt: draft.prompt, operation: draft.operation, mode: draft.mode }));
  } catch {
    // Storage unavailable: the draft still lives for as long as the app is open.
  }
  return draft;
}

export function clearDraft(): GenerateDraft {
  draft = { ...EMPTY_DRAFT };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return draft;
}

/** True when there is something a person would be sorry to lose. */
export function hasDraft(value: GenerateDraft = draft): boolean {
  return value.prompt.trim().length > 0 || value.attachments.length > 0 || value.result !== null;
}
