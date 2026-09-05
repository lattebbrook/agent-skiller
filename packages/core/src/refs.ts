/**
 * References. In a file they read as `${2: Open inbox}`: the number is what
 * the machine follows, the name after the colon is for the person reading.
 *
 * The id is the authority. The label is regenerated from the node's current
 * name every time a skill is parsed or saved, so it can never go stale and a
 * rename costs nothing. `${2}` on its own and `${Open inbox}` by name are both
 * accepted on import and rewritten to the full form.
 */
import type { ConfigValue, Skill, SkillNode } from './model.js';

export const REF_PATTERN = /\$\{([^}]+)\}/g;

export interface Ref {
  raw: string;
  /** Node id, or null for the reserved name "input" and for unresolved names. */
  nodeId: number | null;
  /** Reserved keyword when nodeId is null: 'input'. */
  keyword: string | null;
  /** Optional ".key" suffix, e.g. ${2.subject: Open inbox}. */
  key: string | null;
  /** The human label after the colon, when the reference carries one. */
  label: string | null;
}

/** The text between `${` and `}`. */
function innerOf(raw: string): string {
  return raw.slice(2, -1);
}

export function parseRef(inner: string): Ref {
  const raw = `\${${inner}}`;
  const colon = inner.indexOf(':');
  const head = (colon === -1 ? inner : inner.slice(0, colon)).trim();
  const label = colon === -1 ? null : inner.slice(colon + 1).trim() || null;
  const byId = /^#?(\d+)(?:\.(.+))?$/.exec(head);
  if (byId) return { raw, nodeId: Number(byId[1]), keyword: null, key: byId[2] ?? null, label };
  const keyword = /^(input)(?:\.(.+))?$/i.exec(head);
  if (keyword) return { raw, nodeId: null, keyword: keyword[1]!.toLowerCase(), key: keyword[2] ?? null, label };
  // Anything else is a node name; the colon, if any, belongs to the name.
  return { raw, nodeId: null, keyword: null, key: null, label: null };
}

/** `${2: Open inbox}`, or `${2}` when the node has no usable name. */
export function makeRef(nodeId: number, name?: string, key?: string): string {
  const head = key ? `${nodeId}.${key}` : String(nodeId);
  const label = name?.trim() ?? '';
  // Braces would end the reference early, so a name carrying one is left off.
  return label && !/[{}]/.test(label) ? `\${${head}: ${label}}` : `\${${head}}`;
}

export function findRefs(text: string): Ref[] {
  const refs: Ref[] = [];
  for (const match of text.matchAll(REF_PATTERN)) refs.push(parseRef(match[1]!));
  return refs;
}

/** Every text of a node that can hold a reference, its name included. */
export function nodeTexts(node: SkillNode): string[] {
  const texts = [node.name, node.body, ...node.stages.map((stage) => stage.body)];
  for (const value of Object.values(node.config)) {
    if (Array.isArray(value)) texts.push(...value);
    else texts.push(value);
  }
  return texts;
}

export function nodeRefs(node: SkillNode): Ref[] {
  return nodeTexts(node).flatMap(findRefs);
}

/** Rewrites every reference in the text with the given mapper. */
export function mapRefs(text: string, mapper: (ref: Ref) => string | null): string {
  return text.replace(REF_PATTERN, (whole, inner: string) => mapper(parseRef(inner)) ?? whole);
}

function mapConfigValue(value: ConfigValue, mapper: (ref: Ref) => string | null): ConfigValue {
  return Array.isArray(value) ? value.map((item) => mapRefs(item, mapper)) : mapRefs(value, mapper);
}

export function mapNodeRefs(node: SkillNode, mapper: (ref: Ref) => string | null): SkillNode {
  const config: Record<string, ConfigValue> = {};
  for (const [key, value] of Object.entries(node.config)) config[key] = mapConfigValue(value, mapper);
  return {
    ...node,
    name: mapRefs(node.name, mapper),
    config,
    body: mapRefs(node.body, mapper),
    stages: node.stages.map((stage) => ({ ...stage, body: mapRefs(stage.body, mapper) })),
  };
}

/**
 * Brings every reference to canonical form: names resolved to ids, and each
 * label set to the node's current name. Run after parsing, after importing
 * JSON, and after any edit that renames a node.
 */
export function normalizeRefs(skill: Skill): Skill {
  const nameOf = new Map(skill.nodes.map((node) => [node.id, node.name]));
  const idOf = new Map(skill.nodes.map((node) => [node.name.trim().toLowerCase(), node.id]));

  const mapper = (ref: Ref): string | null => {
    let nodeId = ref.nodeId;
    let key = ref.key;
    if (nodeId === null) {
      if (ref.keyword !== null) return null; // ${input} stands on its own.
      const inner = innerOf(ref.raw).trim();
      const direct = idOf.get(inner.toLowerCase());
      if (direct !== undefined) nodeId = direct;
      else {
        const dot = inner.lastIndexOf('.');
        const withKey = dot > 0 ? idOf.get(inner.slice(0, dot).trim().toLowerCase()) : undefined;
        if (withKey === undefined) return null; // Unknown; validation reports it.
        nodeId = withKey;
        key = inner.slice(dot + 1);
      }
    }
    return makeRef(nodeId, nameOf.get(nodeId), key ?? undefined);
  };

  return { ...skill, nodes: skill.nodes.map((node) => mapNodeRefs(node, mapper)) };
}

/** Rewrites `${old}` → `${new}` following an id map (used when duplicating). */
export function renumberRefs(node: SkillNode, idMap: Map<number, number>): SkillNode {
  return mapNodeRefs(node, (ref) => {
    if (ref.nodeId === null) return null;
    const next = idMap.get(ref.nodeId);
    if (next === undefined) return null;
    return makeRef(next, ref.label ?? undefined, ref.key ?? undefined);
  });
}
