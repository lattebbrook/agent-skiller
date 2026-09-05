/**
 * One door for anything a person drops on the app or an agent hands over:
 * decides whether the text is JSON or Markdown and returns a skill.
 */
import { completeLayout } from './layout.js';
import { fromJson } from './json.js';
import { parseMarkdown, type Diagnostic } from './markdown.js';
import type { Skill } from './model.js';

export interface ImportResult {
  skill: Skill;
  diagnostics: Diagnostic[];
  source: 'json' | 'markdown';
  foreign: boolean;
}

export function importText(text: string, filename = ''): ImportResult {
  const trimmed = text.trim();
  const looksJson = filename.toLowerCase().endsWith('.json') || trimmed.startsWith('{');
  if (looksJson) {
    const { skill, diagnostics } = fromJson(text);
    return { skill: { ...skill, layout: completeLayout(skill) }, diagnostics, source: 'json', foreign: false };
  }
  const { skill, diagnostics, foreign } = parseMarkdown(text);
  return { skill: { ...skill, layout: completeLayout(skill) }, diagnostics, source: 'markdown', foreign };
}
