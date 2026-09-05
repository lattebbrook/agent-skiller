/**
 * The skill model. This is the single source of truth shared by the editor,
 * the server, and the MCP walker. Markdown and JSON are two encodings of it.
 */

export const SKILL_FORMAT = 'agent-skiller/1' as const;

export type NodeType = 'start' | 'do' | 'ask' | 'if' | 'switch' | 'loop' | 'code' | 'skill' | 'error' | 'end';

export const NODE_TYPES: readonly NodeType[] = ['start', 'do', 'ask', 'if', 'switch', 'loop', 'code', 'skill', 'error', 'end'];

/** A config value is a single line or a list of lines. */
export type ConfigValue = string | string[];

export interface Stage {
  /** "2.1", "2.2" — the parent id, a dot, and a 1-based index. */
  id: string;
  name: string;
  body: string;
}

export interface SkillNode {
  /** Positive integer, unique within a skill, never reused. */
  id: number;
  type: NodeType;
  name: string;
  config: Record<string, ConfigValue>;
  /** Instruction text. Markdown allowed. For Code nodes: the code itself. */
  body: string;
  stages: Stage[];
}

export interface Edge {
  from: number;
  /** 'next' | 'yes' | 'no' | 'case:<label>' | 'default' | 'each' | 'done' | 'ok' | 'fail' */
  handle: string;
  to: number;
}

export interface Note {
  id: string;
  text: string;
  attachedTo: number | null;
}

export interface Position {
  x: number;
  y: number;
}

export interface Skill {
  format: typeof SKILL_FORMAT;
  name: string;
  description: string;
  tags: string[];
  version: number;
  /** Title shown as the H1. Defaults to a prettified name. */
  title: string;
  /** Free paragraph under the H1. */
  purpose: string;
  nodes: SkillNode[];
  edges: Edge[];
  notes: Note[];
  /** Node id (as string) or note id → position. Missing entries are auto-laid out. */
  layout: Record<string, Position>;
}

export function createEmptySkill(name = 'new-skill'): Skill {
  return {
    format: SKILL_FORMAT,
    name,
    description: '',
    tags: [],
    version: 1,
    title: prettifyName(name),
    purpose: '',
    nodes: [{ id: 1, type: 'start', name: 'Start', config: {}, body: '', stages: [] }],
    edges: [],
    notes: [],
    layout: { '1': { x: 0, y: 0 } },
  };
}

export function prettifyName(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Untitled skill';
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'skill'
  );
}

export function nextNodeId(skill: Skill): number {
  return skill.nodes.reduce((max, node) => Math.max(max, node.id), 0) + 1;
}

export function findNode(skill: Skill, id: number): SkillNode | undefined {
  return skill.nodes.find((node) => node.id === id);
}

export function incomingEdges(skill: Skill, id: number): Edge[] {
  return skill.edges.filter((edge) => edge.to === id);
}

export function outgoingEdges(skill: Skill, id: number): Edge[] {
  return skill.edges.filter((edge) => edge.from === id);
}

export function cloneSkill(skill: Skill): Skill {
  return JSON.parse(JSON.stringify(skill)) as Skill;
}
