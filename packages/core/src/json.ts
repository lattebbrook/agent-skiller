/**
 * JSON is the lossless interchange form of the model. fromJson() is lenient:
 * it fills defaults and drops unknown fields so an older or hand-made file
 * still opens.
 */
import { NOTE_COLORS, SKILL_FORMAT, prettifyName, slugify, type ConfigValue, type NoteColor, type Skill, type SkillNode } from './model.js';
import { NODE_TYPES } from './model.js';
import { normalizeRefs } from './refs.js';
import type { Diagnostic } from './markdown.js';

export function toJson(skill: Skill): string {
  return `${JSON.stringify(skill, null, 2)}\n`;
}

export function fromJson(text: string): { skill: Skill; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`Not valid JSON: ${(error as Error).message}`);
  }
  if (!raw || typeof raw !== 'object') throw new Error('JSON root must be an object.');
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data['nodes'])) throw new Error('JSON has no "nodes" array; this is not a skill file.');
  if (data['format'] !== undefined && data['format'] !== SKILL_FORMAT) {
    diagnostics.push({ severity: 'warning', message: `Unknown format "${String(data['format'])}"; reading as ${SKILL_FORMAT}.` });
  }

  const nodes: SkillNode[] = [];
  for (const item of data['nodes'] as unknown[]) {
    const node = coerceNode(item, diagnostics);
    if (node) nodes.push(node);
  }
  const ids = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(data['edges'])
    ? (data['edges'] as unknown[]).flatMap((item) => {
        const edge = item as Record<string, unknown>;
        const from = Number(edge['from']);
        const to = Number(edge['to']);
        const handle = typeof edge['handle'] === 'string' ? edge['handle'] : 'next';
        if (!ids.has(from) || !ids.has(to)) {
          diagnostics.push({ severity: 'error', message: `Edge ${from} → ${to} references a missing node; dropped.` });
          return [];
        }
        return [{ from, handle, to }];
      })
    : [];
  const notes = Array.isArray(data['notes'])
    ? (data['notes'] as unknown[]).map((item, index) => {
        const note = item as Record<string, unknown>;
        const color: NoteColor | '' = typeof note['color'] === 'string' && (NOTE_COLORS as readonly string[]).includes(note['color']) ? (note['color'] as NoteColor) : '';
        return {
          id: typeof note['id'] === 'string' ? note['id'] : `n${index + 1}`,
          text: typeof note['text'] === 'string' ? note['text'] : '',
          attachedTo: typeof note['attachedTo'] === 'number' && ids.has(note['attachedTo']) ? note['attachedTo'] : null,
          color,
        };
      })
    : [];
  const layout: Skill['layout'] = {};
  if (data['layout'] && typeof data['layout'] === 'object') {
    for (const [key, value] of Object.entries(data['layout'] as Record<string, unknown>)) {
      const pos = value as Record<string, unknown>;
      if (pos && typeof pos['x'] === 'number' && typeof pos['y'] === 'number') layout[key] = { x: pos['x'], y: pos['y'] };
    }
  }
  const name = slugify(typeof data['name'] === 'string' && data['name'] ? data['name'] : 'imported-skill');
  const skill: Skill = {
    format: SKILL_FORMAT,
    name,
    description: typeof data['description'] === 'string' ? data['description'] : '',
    tags: Array.isArray(data['tags']) ? (data['tags'] as unknown[]).map(String) : [],
    version: Number(data['version']) || 1,
    title: typeof data['title'] === 'string' && data['title'] ? data['title'] : prettifyName(name),
    purpose: typeof data['purpose'] === 'string' ? data['purpose'] : '',
    nodes,
    edges,
    notes,
    layout,
  };
  return { skill: normalizeRefs(skill), diagnostics };
}

function coerceNode(item: unknown, diagnostics: Diagnostic[]): SkillNode | null {
  const raw = item as Record<string, unknown>;
  const id = Number(raw['id']);
  if (!Number.isInteger(id) || id <= 0) {
    diagnostics.push({ severity: 'error', message: `A node has an invalid id (${String(raw['id'])}); dropped.` });
    return null;
  }
  const type = NODE_TYPES.includes(raw['type'] as SkillNode['type']) ? (raw['type'] as SkillNode['type']) : 'do';
  if (type !== raw['type']) diagnostics.push({ severity: 'warning', message: `Node ${id} has unknown type "${String(raw['type'])}"; treated as Do.`, nodeId: id });
  const config: Record<string, ConfigValue> = {};
  if (raw['config'] && typeof raw['config'] === 'object') {
    for (const [key, value] of Object.entries(raw['config'] as Record<string, unknown>)) {
      if (typeof value === 'string') config[key] = value;
      else if (Array.isArray(value)) config[key] = value.map(String);
      else if (value !== null && value !== undefined) config[key] = String(value);
    }
  }
  const stages = Array.isArray(raw['stages'])
    ? (raw['stages'] as unknown[]).map((entry, index) => {
        const stage = entry as Record<string, unknown>;
        return {
          id: typeof stage['id'] === 'string' ? stage['id'] : `${id}.${index + 1}`,
          name: typeof stage['name'] === 'string' ? stage['name'] : '',
          body: typeof stage['body'] === 'string' ? stage['body'] : '',
        };
      })
    : [];
  return {
    id,
    type,
    name: typeof raw['name'] === 'string' ? raw['name'] : `Step ${id}`,
    config,
    body: typeof raw['body'] === 'string' ? raw['body'] : '',
    stages,
  };
}
