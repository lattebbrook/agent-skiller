/**
 * The canonical Markdown encoding of a skill.
 *
 *   ---                        frontmatter (SKILL.md compatible)
 *   name: ...
 *   ---
 *   # Title                    one H1, then an optional purpose paragraph
 *   ## 2. Do: Open inbox       "## <id>. <Type>: <name>" — a node
 *   - key: value               config lines (closed set per type)
 *   instruction text           everything else is the body
 *   ### 2.1 Stage name         optional stages
 *   - next: 3                  edges: "- <handle>: <id>"
 *   > Note (on 2): text        notes; "(on N)" attaches to a node
 *   <!-- agent-skiller:layout {...} -->   positions, ignored by readers
 *
 * parse() and serialize() are inverses on canonical documents; that is a
 * tested invariant. Unknown "- key: value" lines are kept as body text so a
 * hand edit is never destroyed by a re-save.
 */
import {
  SKILL_FORMAT,
  prettifyName,
  slugify,
  type ConfigValue,
  type Edge,
  type Note,
  type NodeType,
  type Position,
  type Skill,
  type SkillNode,
  type Stage,
} from './model.js';
import { NODE_META, asList, configKeys, outputHandles, typeFromKeyword, withCase } from './nodeTypes.js';
import { normalizeRefs } from './refs.js';

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  nodeId?: number;
}

export interface ParseResult {
  skill: Skill;
  diagnostics: Diagnostic[];
  /** True when the document had no "## N." headings and was imported as a chain of Do nodes. */
  foreign: boolean;
}

const LAYOUT_MARKER = 'agent-skiller:layout';
const HEADING = /^##\s+(\d+)\.\s*(.*?)\s*$/;
const STAGE_HEADING = /^###\s+(\d+)\.(\d+)\.?\s*(.*?)\s*$/;
const CONFIG_LINE = /^[-*]\s+([^:]+?):\s*(.*?)\s*$/;
const CASE_LINE = /^case\s+(?:"([^"]*)"|(.+?))$/;
const NOTE_LINE = /^>\s*Note(?:\s*\(on\s+#?(\d+)\))?\s*:\s*(.*)$/i;
const EDGE_HANDLES = new Set(['next', 'yes', 'no', 'default', 'fail']);

// ---------------------------------------------------------------- parsing

export function parseMarkdown(text: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  const { frontmatter, bodyStart } = readFrontmatter(lines);
  const { layout, lastLine } = readLayout(lines);

  const skill: Skill = {
    format: SKILL_FORMAT,
    name: '',
    description: frontmatter['description'] ?? '',
    tags: readTags(frontmatter['tags']),
    version: Number(frontmatter['version'] ?? 1) || 1,
    title: '',
    purpose: '',
    nodes: [],
    edges: [],
    notes: [],
    layout,
  };

  // Split into the preamble (before the first node) and node sections.
  const sections: { headingLine: number; heading: string; lines: string[] }[] = [];
  const preamble: string[] = [];
  let current: { headingLine: number; heading: string; lines: string[] } | null = null;
  let inFence = false;
  for (let index = bodyStart; index < lastLine; index += 1) {
    const line = lines[index]!;
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && HEADING.test(line)) {
      current = { headingLine: index + 1, heading: line, lines: [] };
      sections.push(current);
      continue;
    }
    (current ? current.lines : preamble).push(line);
  }

  const foreign = sections.length === 0;
  if (foreign) return parseForeign(lines.slice(bodyStart, lastLine), frontmatter, skill, diagnostics);

  const { title, purpose, notes: preambleNotes } = readPreamble(preamble);
  skill.title = title;
  skill.purpose = purpose;
  let noteCounter = 0;
  const pushNote = (note: Omit<Note, 'id'>) => {
    noteCounter += 1;
    skill.notes.push({ id: `n${noteCounter}`, ...note });
  };
  for (const note of preambleNotes) pushNote(note);

  const seenIds = new Set<number>();
  const pendingEdges: { edge: Edge; line: number }[] = [];
  for (const section of sections) {
    const match = HEADING.exec(section.heading)!;
    const id = Number(match[1]);
    if (seenIds.has(id)) {
      diagnostics.push({ severity: 'error', message: `Node id ${id} is used twice.`, line: section.headingLine, nodeId: id });
      continue;
    }
    seenIds.add(id);
    const { type, name } = readTitle(match[2] ?? '');
    const node: SkillNode = { id, type, name, config: {}, body: '', stages: [] };
    const parsed = readSection(node, section.lines, section.headingLine);
    skill.nodes.push(parsed.node);
    for (const edge of parsed.edges) pendingEdges.push(edge);
    for (const note of parsed.notes) pushNote(note);
  }

  for (const { edge, line } of pendingEdges) {
    if (!seenIds.has(edge.to)) {
      diagnostics.push({ severity: 'error', message: `"${edge.handle}" points to node ${edge.to}, which does not exist.`, line, nodeId: edge.from });
      continue;
    }
    skill.edges.push(edge);
  }

  if (!skill.nodes.some((node) => node.type === 'start')) {
    const first = skill.nodes[0];
    const startId = Math.max(0, ...skill.nodes.map((node) => node.id)) + 1;
    skill.nodes.unshift({ id: startId, type: 'start', name: 'Start', config: {}, body: '', stages: [] });
    if (first) skill.edges.unshift({ from: startId, handle: 'next', to: first.id });
    diagnostics.push({ severity: 'warning', message: 'No Start node found; one was added.' });
  }

  skill.name = frontmatter['name'] ? slugify(frontmatter['name']) : slugify(skill.title || 'skill');
  if (!skill.title) skill.title = prettifyName(skill.name);
  if (!frontmatter['name']) diagnostics.push({ severity: 'info', message: 'No frontmatter name; derived from the title.' });

  return { skill: normalizeRefs(skill), diagnostics, foreign };
}

function readFrontmatter(lines: string[]): { frontmatter: Record<string, string>; bodyStart: number } {
  const frontmatter: Record<string, string> = {};
  if (lines[0]?.trim() !== '---') return { frontmatter, bodyStart: 0 };
  let index = 1;
  let currentListKey: string | null = null;
  for (; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.trim() === '---') return { frontmatter, bodyStart: index + 1 };
    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && currentListKey) {
      frontmatter[currentListKey] = `${frontmatter[currentListKey] ?? ''}${frontmatter[currentListKey] ? ',' : ''}${listItem[1]}`;
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1]!;
    const value = unquote(pair[2] ?? '');
    currentListKey = value === '' ? key : null;
    frontmatter[key] = value;
  }
  return { frontmatter, bodyStart: 0 };
}

function readTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((tag) => unquote(tag.trim()))
    .filter(Boolean);
}

function readLayout(lines: string[]): { layout: Record<string, Position>; lastLine: number } {
  const layout: Record<string, Position> = {};
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (line.trim() === '') continue;
    if (!line.trim().startsWith('<!--') || !line.includes(LAYOUT_MARKER)) return { layout, lastLine: lines.length };
    const json = line.slice(line.indexOf(LAYOUT_MARKER) + LAYOUT_MARKER.length).replace(/-->\s*$/, '').trim();
    try {
      const parsed = JSON.parse(json) as Record<string, [number, number]>;
      for (const [key, value] of Object.entries(parsed)) {
        if (Array.isArray(value) && value.length === 2) layout[key] = { x: Number(value[0]), y: Number(value[1]) };
      }
    } catch {
      // A broken layout comment costs nothing but positions.
    }
    return { layout, lastLine: index };
  }
  return { layout, lastLine: lines.length };
}

function readPreamble(lines: string[]): { title: string; purpose: string; notes: Omit<Note, 'id'>[] } {
  let title = '';
  const purposeLines: string[] = [];
  const notes: Omit<Note, 'id'>[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const heading = /^#\s+(.*)$/.exec(line);
    if (heading && !title) {
      title = heading[1]!.trim();
      index += 1;
      continue;
    }
    const note = readNote(lines, index);
    if (note) {
      notes.push(note.note);
      index = note.nextIndex;
      continue;
    }
    purposeLines.push(line);
    index += 1;
  }
  return { title, purpose: purposeLines.join('\n').trim(), notes };
}

function readNote(lines: string[], index: number): { note: Omit<Note, 'id'>; nextIndex: number } | null {
  const first = NOTE_LINE.exec(lines[index] ?? '');
  if (!first) return null;
  const textLines = [first[2] ?? ''];
  let next = index + 1;
  while (next < lines.length && /^>\s?/.test(lines[next]!) && !NOTE_LINE.test(lines[next]!)) {
    textLines.push(lines[next]!.replace(/^>\s?/, ''));
    next += 1;
  }
  return {
    note: { text: textLines.join('\n').trim(), attachedTo: first[1] ? Number(first[1]) : null },
    nextIndex: next,
  };
}

function readTitle(rest: string): { type: NodeType; name: string } {
  const prefixed = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(rest);
  if (prefixed) {
    const type = typeFromKeyword(prefixed[1]!);
    if (type) return { type, name: prefixed[2]!.trim() || NODE_META[type].label };
  }
  const bare = typeFromKeyword(rest);
  if (bare) return { type: bare, name: NODE_META[bare].label };
  return { type: 'do', name: rest.trim() || 'Step' };
}

function readSection(
  node: SkillNode,
  lines: string[],
  headingLine: number,
): { node: SkillNode; edges: { edge: Edge; line: number }[]; notes: Omit<Note, 'id'>[] } {
  const edges: { edge: Edge; line: number }[] = [];
  const notes: Omit<Note, 'id'>[] = [];
  const keys = new Set(configKeys(node.type));
  const listKeys = new Set(NODE_META[node.type].fields.filter((field) => field.kind === 'list').map((field) => field.key));
  const bodyLines: string[] = [];
  let stage: Stage | null = null;
  let stageLines: string[] = [];
  let inFence = false;

  const flushStage = () => {
    if (!stage) return;
    stage.body = stageLines.join('\n').trim();
    node.stages.push(stage);
    stage = null;
    stageLines = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const lineNumber = headingLine + 1 + index;

    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      (stage ? stageLines : bodyLines).push(line);
      index += 1;
      continue;
    }
    if (inFence) {
      (stage ? stageLines : bodyLines).push(line);
      index += 1;
      continue;
    }

    const stageMatch = STAGE_HEADING.exec(line);
    if (stageMatch && Number(stageMatch[1]) === node.id) {
      flushStage();
      stage = { id: `${node.id}.${stageMatch[2]}`, name: (stageMatch[3] ?? '').trim(), body: '' };
      index += 1;
      continue;
    }

    const note = readNote(lines, index);
    if (note) {
      notes.push(note.note);
      index = note.nextIndex;
      continue;
    }

    const config = CONFIG_LINE.exec(line);
    if (config) {
      const key = config[1]!.trim().toLowerCase();
      const value = config[2] ?? '';
      const caseMatch = CASE_LINE.exec(key);
      const target = readTarget(value);
      if (caseMatch && node.type === 'switch' && (target !== null || /^(none|-)?$/i.test(value.trim()))) {
        const label = (caseMatch[1] ?? caseMatch[2] ?? '').trim();
        node.config = withCase(node.config, label);
        if (target !== null) edges.push({ edge: { from: node.id, handle: `case:${label}`, to: target }, line: lineNumber });
        index += 1;
        continue;
      }
      if (EDGE_HANDLES.has(key) && target !== null) {
        edges.push({ edge: { from: node.id, handle: key, to: target }, line: lineNumber });
        index += 1;
        continue;
      }
      if (EDGE_HANDLES.has(key) && /^(none|end|stop|-)?$/i.test(value.trim())) {
        index += 1;
        continue;
      }
      if (keys.has(key)) {
        const unquoted = unquote(value);
        if (listKeys.has(key)) {
          const existing = node.config[key];
          node.config[key] = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), unquoted];
        } else {
          node.config[key] = unquoted;
        }
        index += 1;
        continue;
      }
    }

    (stage ? stageLines : bodyLines).push(line);
    index += 1;
  }
  flushStage();

  node.body = unfence(node, bodyLines.join('\n').trim());
  return { node, edges, notes };
}

function readTarget(value: string): number | null {
  const match = /^(?:\$\{)?#?(\d+)\}?(?:\s*[.:-].*)?$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/** Code nodes store bare code; the fence is an encoding detail. */
function unfence(node: SkillNode, body: string): string {
  if (node.type !== 'code') return body;
  const match = /^```([\w+-]*)\s*\n([\s\S]*?)\n?```\s*$/.exec(body);
  if (!match) return body;
  const language = match[1]?.toLowerCase();
  if (language && !node.config['language']) node.config['language'] = language === 'py' ? 'python' : language === 'js' ? 'javascript' : language;
  return match[2] ?? '';
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** A plain document: every heading becomes a Do node, chained in order. */
function parseForeign(lines: string[], frontmatter: Record<string, string>, skill: Skill, diagnostics: Diagnostic[]): ParseResult {
  const sections: { name: string; lines: string[] }[] = [];
  const preamble: string[] = [];
  let title = '';
  let current: { name: string; lines: string[] } | null = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const heading = !inFence && /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      if (heading[1] === '#' && !title && sections.length === 0) {
        title = heading[2]!.trim();
        continue;
      }
      current = { name: heading[2]!.replace(/^\d+[.)]\s*/, '').trim(), lines: [] };
      sections.push(current);
      continue;
    }
    (current ? current.lines : preamble).push(line);
  }

  skill.title = title || prettifyName(frontmatter['name'] ?? 'imported-skill');
  skill.name = slugify(frontmatter['name'] ?? skill.title);
  skill.nodes.push({ id: 1, type: 'start', name: 'Start', config: {}, body: '', stages: [] });

  const preambleText = preamble.join('\n').trim();
  if (sections.length === 0) {
    if (preambleText) skill.nodes.push({ id: 2, type: 'do', name: 'Follow the instructions', config: {}, body: preambleText, stages: [] });
  } else {
    skill.purpose = preambleText;
    sections.forEach((section, index) => {
      skill.nodes.push({ id: index + 2, type: 'do', name: section.name || `Step ${index + 1}`, config: {}, body: section.lines.join('\n').trim(), stages: [] });
    });
  }
  for (let index = 0; index < skill.nodes.length - 1; index += 1) {
    skill.edges.push({ from: skill.nodes[index]!.id, handle: 'next', to: skill.nodes[index + 1]!.id });
  }
  diagnostics.push({ severity: 'info', message: `Imported a plain document as ${skill.nodes.length - 1} step(s).` });
  return { skill, diagnostics, foreign: true };
}

// ---------------------------------------------------------- serializing

export function serializeMarkdown(skill: Skill): string {
  const out: string[] = [];
  out.push('---');
  out.push(`name: ${skill.name}`);
  out.push(`description: ${quoteIfNeeded(skill.description)}`);
  if (skill.tags.length) out.push(`tags: [${skill.tags.join(', ')}]`);
  out.push(`version: ${skill.version}`);
  out.push(`format: ${skill.format}`);
  out.push('---');
  out.push('');
  out.push(`# ${skill.title || prettifyName(skill.name)}`);
  if (skill.purpose.trim()) {
    out.push('');
    out.push(skill.purpose.trim());
  }
  const freeNotes = skill.notes.filter((note) => note.attachedTo === null || !skill.nodes.some((node) => node.id === note.attachedTo));

  for (const node of skill.nodes) {
    out.push('');
    out.push(...serializeNode(skill, node));
    for (const note of skill.notes) {
      if (note.attachedTo === node.id) {
        out.push('');
        out.push(...serializeNote(note));
      }
    }
  }
  for (const note of freeNotes) {
    out.push('');
    out.push(...serializeNote(note));
  }

  const layoutEntries = Object.entries(skill.layout).filter(
    ([key]) => skill.nodes.some((node) => String(node.id) === key) || skill.notes.some((note) => note.id === key),
  );
  if (layoutEntries.length) {
    const compact = Object.fromEntries(layoutEntries.map(([key, pos]) => [key, [Math.round(pos.x), Math.round(pos.y)]]));
    out.push('');
    out.push(`<!-- ${LAYOUT_MARKER} ${JSON.stringify(compact)} -->`);
  }
  out.push('');
  return out.join('\n');
}

/** One node's section, as it will appear in the file. */
export function serializeNodeMarkdown(skill: Skill, node: SkillNode): string {
  return serializeNode(skill, node).join('\n');
}

function serializeNode(skill: Skill, node: SkillNode): string[] {
  const meta = NODE_META[node.type];
  const lines: string[] = [];
  const isBareKeyword = node.name.trim() === '' || node.name.trim().toLowerCase() === meta.label.toLowerCase();
  lines.push(isBareKeyword ? `## ${node.id}. ${meta.keyword}` : `## ${node.id}. ${meta.keyword}: ${node.name.trim()}`);

  for (const field of meta.fields) {
    if (field.key === 'language') continue; // the code fence carries it
    const value = node.config[field.key];
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item.trim() === '') continue;
      lines.push(`- ${field.key}: ${quoteIfNeeded(item)}`);
    }
  }

  const body = node.body.trim();
  if (meta.hasBody && body) {
    if (node.type === 'code') {
      const language = String(node.config['language'] ?? 'python');
      lines.push('```' + language);
      lines.push(body);
      lines.push('```');
    } else {
      lines.push(body);
    }
  }

  for (const stage of node.stages) {
    lines.push(`### ${stage.id} ${stage.name}`.trimEnd());
    if (stage.body.trim()) lines.push(stage.body.trim());
  }

  const handles = outputHandles(node).map((handle) => handle.id);
  const edges = [...skill.edges.filter((edge) => edge.from === node.id)].sort((a, b) => {
    const ai = handles.indexOf(a.handle);
    const bi = handles.indexOf(b.handle);
    const order = (ai === -1 ? handles.length : ai) - (bi === -1 ? handles.length : bi);
    return order !== 0 ? order : a.to - b.to;
  });
  for (const edge of edges) lines.push(`- ${edgeKey(edge.handle)}: ${edge.to}`);
  // Cases without an arrow yet are still part of the node.
  if (node.type === 'switch') {
    for (const label of asList(node.config['cases'])) {
      if (!edges.some((edge) => edge.handle === `case:${label}`)) lines.push(`- ${edgeKey(`case:${label}`)}: none`);
    }
  }
  return lines;
}

function edgeKey(handle: string): string {
  if (!handle.startsWith('case:')) return handle;
  const label = handle.slice(5);
  return /[:"]/.test(label) || label.trim() !== label ? `case "${label.replace(/"/g, '')}"` : `case ${label}`;
}

function serializeNote(note: Note): string[] {
  const textLines = note.text.split('\n');
  const head = note.attachedTo === null ? `> Note: ${textLines[0] ?? ''}` : `> Note (on ${note.attachedTo}): ${textLines[0] ?? ''}`;
  return [head, ...textLines.slice(1).map((line) => `> ${line}`)];
}

/** Values are single lines; only an empty value or one that itself starts and ends with quotes needs wrapping so unquote() restores it. */
function quoteIfNeeded(value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return '""';
  const wrapped = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return wrapped && trimmed.length >= 2 ? `"${trimmed}"` : trimmed;
}

export function isConfigValueEmpty(value: ConfigValue | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) ? value.every((item) => item.trim() === '') : value.trim() === '';
}
