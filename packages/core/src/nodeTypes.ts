/**
 * The node catalogue. Deliberately small and grouped by what a person is
 * trying to do, so the palette reads at a glance and any kind can be written
 * by hand in a .md file without looking anything up.
 *
 *   Flow      Start · End · Error
 *   Steps     Do · Ask · Confirm · Text
 *   Logic     If · Switch · Loop
 *   Tools     Command · Code · Web · File · Request
 *   Reuse     Skill
 */
import type { ConfigValue, NodeType, SkillNode } from './model.js';

export interface ConfigField {
  key: string;
  label: string;
  kind: 'text' | 'list';
  placeholder?: string;
  help?: string;
  /** Shown but not editable: the kind itself carries this rule. */
  locked?: boolean;
}

export interface HandleSpec {
  id: string;
  label: string;
}

export type NodeGroup = 'flow' | 'steps' | 'logic' | 'tools' | 'reuse';

export const NODE_GROUPS: { id: NodeGroup; label: string; description: string }[] = [
  { id: 'flow', label: 'Flow', description: 'Where a skill starts and how it ends.' },
  { id: 'steps', label: 'Steps', description: 'Things the agent does or asks.' },
  { id: 'logic', label: 'Logic', description: 'Branch and repeat.' },
  { id: 'tools', label: 'Tools', description: 'Terminal, code, browser, files, APIs.' },
  { id: 'reuse', label: 'Reuse', description: 'Skills inside skills.' },
];

export interface NodeTypeMeta {
  type: NodeType;
  group: NodeGroup;
  /** Word used in the Markdown heading: "## 2. Do: Open inbox". */
  keyword: string;
  label: string;
  description: string;
  namePlaceholder: string;
  hasInput: boolean;
  outputs: HandleSpec[];
  fields: ConfigField[];
  hasBody: boolean;
  bodyLabel: string;
  bodyPlaceholder: string;
  /** The body is a fenced code block in the file; `fence` is the default language tag. */
  fence?: string;
  /** Shown above the body: this step can change things outside the skill. */
  caution?: string;
  color: string;
}

export const TEXT_CHECK_RULE = 'check the format and correctness of this text before continuing';

export const CAUTION_COMMAND =
  'Commands run on the machine the agent controls and can delete, overwrite or send data. You are responsible for what they do; AgentSkiller does not check or limit them.';
export const CAUTION_CODE =
  'Code runs with real access when an agent follows this skill. The local sandbox limits time and memory only. You are responsible for what it does.';

export const NODE_META: Record<NodeType, NodeTypeMeta> = {
  start: {
    type: 'start',
    group: 'flow',
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
  end: {
    type: 'end',
    group: 'flow',
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
  error: {
    type: 'error',
    group: 'flow',
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
  do: {
    type: 'do',
    group: 'steps',
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
    group: 'steps',
    keyword: 'Ask',
    label: 'Ask',
    description: "Ask the user something and wait. The answer is this node's result.",
    namePlaceholder: 'Where should this go?',
    hasInput: true,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [],
    hasBody: true,
    bodyLabel: 'Question',
    bodyPlaceholder: 'The question, with the options if there are any.',
    color: '#a855f7',
  },
  confirm: {
    type: 'confirm',
    group: 'steps',
    keyword: 'Confirm',
    label: 'Confirm',
    description: 'Show the user what is about to happen and wait for a yes or no. Put one before anything destructive.',
    namePlaceholder: 'Delete the 12 duplicate files?',
    hasInput: true,
    outputs: [
      { id: 'yes', label: 'yes' },
      { id: 'no', label: 'no' },
    ],
    fields: [],
    hasBody: true,
    bodyLabel: 'What to show the user',
    bodyPlaceholder: 'List exactly what will change, e.g. the files from ${3}, and ask for a yes or no.',
    color: '#d946ef',
  },
  text: {
    type: 'text',
    group: 'steps',
    keyword: 'Text',
    label: 'Text',
    description: 'A piece of text the agent must check for format and correctness before moving on.',
    namePlaceholder: 'Reply to the customer',
    hasInput: true,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [{ key: 'check', label: 'Rule', kind: 'text', locked: true, help: 'Every Text node carries this rule; it cannot be removed.' }],
    hasBody: true,
    bodyLabel: 'The text',
    bodyPlaceholder: 'Write the text as it should read, with ${n} where a result from an earlier step goes.',
    color: '#0ea5e9',
  },
  if: {
    type: 'if',
    group: 'logic',
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
    group: 'logic',
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
    group: 'logic',
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
  command: {
    type: 'command',
    group: 'tools',
    keyword: 'Command',
    label: 'Command',
    description: 'A shell command the agent runs in its terminal, e.g. ssh, cd, mkdir.',
    namePlaceholder: 'Create the release folder',
    hasInput: true,
    outputs: [
      { id: 'next', label: 'next' },
      { id: 'fail', label: 'fail' },
    ],
    fields: [{ key: 'shell', label: 'Shell', kind: 'text', placeholder: 'sh' }],
    hasBody: true,
    bodyLabel: 'Command',
    bodyPlaceholder: 'mkdir -p ~/releases/${2}\ncd ~/releases/${2}',
    fence: 'sh',
    caution: CAUTION_COMMAND,
    color: '#e11d48',
  },
  code: {
    type: 'code',
    group: 'tools',
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
    fence: 'python',
    caution: CAUTION_CODE,
    color: '#ec4899',
  },
  web: {
    type: 'web',
    group: 'tools',
    keyword: 'Web',
    label: 'Web',
    description: 'Go to a page in the browser and do something there.',
    namePlaceholder: 'Open the orders page',
    hasInput: true,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [{ key: 'url', label: 'URL', kind: 'text', placeholder: 'https://…' }],
    hasBody: true,
    bodyLabel: 'What to do on the page',
    bodyPlaceholder: 'Log in if asked. Filter by ${2} and read the total at the bottom.',
    color: '#2563eb',
  },
  file: {
    type: 'file',
    group: 'tools',
    keyword: 'File',
    label: 'File',
    description: 'Read, write, move or check a file or folder.',
    namePlaceholder: 'Save the summary',
    hasInput: true,
    outputs: [{ id: 'next', label: 'next' }],
    fields: [{ key: 'path', label: 'Path', kind: 'text', placeholder: '~/Documents/summary.md' }],
    hasBody: true,
    bodyLabel: 'What to do with it',
    bodyPlaceholder: 'Write ${4} to the file, replacing what is there.',
    color: '#f97316',
  },
  request: {
    type: 'request',
    group: 'tools',
    keyword: 'Request',
    label: 'Request',
    description: 'Call an HTTP API and use what comes back.',
    namePlaceholder: 'Fetch open tickets',
    hasInput: true,
    outputs: [
      { id: 'next', label: 'next' },
      { id: 'fail', label: 'fail' },
    ],
    fields: [
      { key: 'method', label: 'Method', kind: 'text', placeholder: 'GET' },
      { key: 'url', label: 'URL', kind: 'text', placeholder: 'https://api.example.com/tickets?state=open' },
    ],
    hasBody: true,
    bodyLabel: 'Body, headers, and what to take from the response',
    bodyPlaceholder: 'Send the JSON from ${3}. Keep the "id" and "title" of each item in the response.',
    color: '#84cc16',
  },
  skill: {
    type: 'skill',
    group: 'reuse',
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
};

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
  group: NodeGroup;
  description: string;
}

/** Palette order: by group, then as listed in NODE_META. */
export const PALETTE: PaletteEntry[] = NODE_GROUPS.flatMap((group) =>
  (Object.values(NODE_META) as NodeTypeMeta[])
    .filter((meta) => meta.group === group.id)
    .map((meta) => ({ id: meta.type, label: meta.label, type: meta.type, group: meta.group, description: meta.description })),
);

/** The fence language written to the file for a fenced-body node. */
export function fenceLanguage(node: Pick<SkillNode, 'type' | 'config'>): string {
  const meta = NODE_META[node.type];
  if (!meta.fence) return '';
  if (node.type === 'code') return asText(node.config['language']) || 'python';
  if (node.type === 'command') return asText(node.config['shell']) || 'sh';
  return meta.fence;
}

export function defaultConfig(type: NodeType): Record<string, ConfigValue> {
  switch (type) {
    case 'code':
      return { language: 'python' };
    case 'command':
      return { shell: 'sh' };
    case 'text':
      return { check: TEXT_CHECK_RULE };
    case 'request':
      return { method: 'GET' };
    default:
      return {};
  }
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
