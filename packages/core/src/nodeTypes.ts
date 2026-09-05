/**
 * The node catalogue. Deliberately small: a person should be able to write
 * any of these by hand in a .md file without looking anything up.
 *
 *   Start   - when: … / - input: …          where the skill begins
 *   Do      free text                        a step the agent performs
 *   Ask     free text                        a question for the user; the answer is ${n}
 *   If      heading is the question          - yes: N / - no: N
 *   Switch  heading says what to look at     - case pdf: N … / - default: N
 *   Loop    heading says what to repeat      the body is done for each item, then - next
 *   Code    a ```python``` or ```javascript``` fence   - next: N / - fail: N
 *   Skill   heading names another skill      - next: N
 *   Error   free text                        stops the run with that message
 *   End     free text                        finishes and reports
 */
import type { ConfigValue, NodeType, SkillNode } from './model.js';

export interface ConfigField {
  key: string;
  label: string;
  kind: 'text' | 'list';
  placeholder?: string;
  help?: string;
}

export interface HandleSpec {
  /** Stable handle id, e.g. 'yes'. For switch, cases are 'case:<label>'. */
  id: string;
  label: string;
}

export interface NodeTypeMeta {
  type: NodeType;
  /** Word used in the Markdown heading: "## 2. Do: Open inbox". */
  keyword: string;
  label: string;
  description: string;
  /** What to put in the heading after the colon. */
  namePlaceholder: string;
  hasInput: boolean;
  /** Fixed output handles. Switch adds one per case; see outputHandles(). */
  outputs: HandleSpec[];
  fields: ConfigField[];
  hasBody: boolean;
  bodyLabel: string;
  bodyPlaceholder: string;
  color: string;
}

export const NODE_META: Record<NodeType, NodeTypeMeta> = {
  start: {
    type: 'start',
    keyword: 'Start',
    label: 'Start',
    description: 'Where the skill begins and when an agent should use it.',
    namePlaceholder: 'Start',
    hasInput: false,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [
      { key: 'when', label: 'When', kind: 'list', placeholder: 'the user asks to summarize the inbox', help: 'Phrases, schedules or events that should start this skill.' },
      { key: 'input', label: 'Input', kind: 'text', placeholder: 'what the caller passes in, if anything' },
    ],
    hasBody: false,
    bodyLabel: '',
    bodyPlaceholder: '',
    color: '#22c55e',
  },
  do: {
    type: 'do',
    keyword: 'Do',
    label: 'Do',
    description: 'A step the agent performs.',
    namePlaceholder: 'Open the inbox',
    hasInput: true,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [],
    hasBody: true,
    bodyLabel: 'Instruction',
    bodyPlaceholder: 'Tell the agent what to do. Drag a node chip in to use its result, e.g. ${2}.',
    color: '#3b82f6',
  },
  ask: {
    type: 'ask',
    keyword: 'Ask',
    label: 'Ask',
    description: 'Ask the user something and wait. The answer becomes this node\'s result.',
    namePlaceholder: 'Where should this go?',
    hasInput: true,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [],
    hasBody: true,
    bodyLabel: 'Question',
    bodyPlaceholder: 'The question, with the options if there are any.',
    color: '#a855f7',
  },
  if: {
    type: 'if',
    keyword: 'If',
    label: 'If',
    description: 'A yes/no question. Two arrows out: yes and no.',
    namePlaceholder: 'Any unread messages?',
    hasInput: true,
    outputs: [
      { id: 'yes', label: 'yes' },
      { id: 'no', label: 'no' },
    ],
    fields: [],
    hasBody: true,
    bodyLabel: 'How to decide (optional)',
    bodyPlaceholder: 'Look at ${2}. Unread messages are bold or have a blue dot.',
    color: '#f59e0b',
  },
  switch: {
    type: 'switch',
    keyword: 'Switch',
    label: 'Switch',
    description: 'Look at one thing and follow the matching case.',
    namePlaceholder: 'What is the file type?',
    hasInput: true,
    outputs: [{ id: 'default', label: 'default' }],
    fields: [],
    hasBody: true,
    bodyLabel: 'How to decide (optional)',
    bodyPlaceholder: 'Use the extension from ${2}.',
    color: '#f59e0b',
  },
  loop: {
    type: 'loop',
    keyword: 'Loop',
    label: 'Loop',
    description: 'Repeat the instruction for each item, then continue.',
    namePlaceholder: 'For each unread message in ${2}',
    hasInput: true,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [],
    hasBody: true,
    bodyLabel: 'What to do for each one',
    bodyPlaceholder: 'Open it, note the sender and subject.',
    color: '#06b6d4',
  },
  code: {
    type: 'code',
    keyword: 'Code',
    label: 'Code',
    description: 'A small Python (or JavaScript) script, run in the sandbox.',
    namePlaceholder: 'Rank by sender',
    hasInput: true,
    outputs: [
      { id: 'next', label: 'next' },
      { id: 'fail', label: 'fail' },
    ],
    fields: [{ key: 'language', label: 'Language', kind: 'text' }],
    hasBody: true,
    bodyLabel: 'Code',
    bodyPlaceholder: 'import json, sys\ndata = json.load(sys.stdin)   # {"input": …, "steps": {"2": …}}\nprint(json.dumps(data["steps"]["2"]))',
    color: '#ec4899',
  },
  skill: {
    type: 'skill',
    keyword: 'Skill',
    label: 'Skill',
    description: 'Run another skill from the workspace, by name.',
    namePlaceholder: 'summarize-inbox',
    hasInput: true,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [],
    hasBody: true,
    bodyLabel: 'What to hand over (optional)',
    bodyPlaceholder: 'Pass ${2} as the input.',
    color: '#8b5cf6',
  },
  error: {
    type: 'error',
    keyword: 'Error',
    label: 'Error',
    description: 'Stop the skill and report a problem.',
    namePlaceholder: 'Ranking failed',
    hasInput: true,
    outputs: [],
    fields: [],
    hasBody: true,
    bodyLabel: 'Message',
    bodyPlaceholder: 'What went wrong and what the user should know.',
    color: '#ef4444',
  },
  end: {
    type: 'end',
    keyword: 'End',
    label: 'End',
    description: 'Finish the skill and report back.',
    namePlaceholder: 'Report',
    hasInput: true,
    outputs: [],
    fields: [],
    hasBody: true,
    bodyLabel: 'What to report',
    bodyPlaceholder: 'Tell the user, in at most five lines, what is new. Use ${6}.',
    color: '#14b8a6',
  },
};

/** Keyword (case-insensitive) → type. */
export function typeFromKeyword(keyword: string): NodeType | undefined {
  return NODE_TYPES_BY_KEYWORD[keyword.trim().toLowerCase()];
}

const NODE_TYPES_BY_KEYWORD: Record<string, NodeType> = Object.fromEntries(
  Object.values(NODE_META).map((meta) => [meta.keyword.toLowerCase(), meta.type]),
);

/** Handles that carry an edge, for the node as configured (switch cases included). */
export function outputHandles(node: Pick<SkillNode, 'type' | 'config'>): HandleSpec[] {
  const meta = NODE_META[node.type];
  if (node.type !== 'switch') return meta.outputs;
  return [...asList(node.config['cases']).map((label) => ({ id: `case:${label}`, label })), ...meta.outputs];
}

export function configKeys(type: NodeType): string[] {
  return NODE_META[type].fields.map((field) => field.key);
}

export function asList(value: ConfigValue | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : value === '' ? [] : [value];
}

export function asText(value: ConfigValue | undefined): string {
  if (value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

export interface PaletteEntry {
  id: string;
  label: string;
  type: NodeType;
  description: string;
}

export const PALETTE: PaletteEntry[] = (['start', 'do', 'ask', 'if', 'switch', 'loop', 'code', 'skill', 'error', 'end'] as NodeType[]).map((type) => ({
  id: type,
  label: NODE_META[type].label,
  type,
  description: NODE_META[type].description,
}));

export function defaultConfig(type: NodeType): Record<string, ConfigValue> {
  return type === 'code' ? { language: 'python' } : {};
}

export function defaultName(type: NodeType): string {
  return NODE_META[type].label;
}

/** Adds a switch case (creating the output handle) if it is not there yet. */
export function withCase(config: Record<string, ConfigValue>, label: string): Record<string, ConfigValue> {
  const cases = asList(config['cases']);
  const clean = label.trim();
  if (!clean || cases.includes(clean)) return config;
  return { ...config, cases: [...cases, clean] };
}
