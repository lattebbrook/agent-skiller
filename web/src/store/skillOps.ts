/**
 * Pure edits on a Skill. The store wraps these with history and selection;
 * tests call them directly.
 */
import {
  NODE_META,
  cloneSkill,
  defaultConfig,
  defaultName,
  nextNodeId,
  normalizeRefs,
  outputHandles,
  renumberRefs,
  type ConfigValue,
  type Edge,
  type Note,
  type NodeType,
  type Position,
  type Skill,
  type SkillNode,
} from '@agent-skiller/core';

export const PASTE_OFFSET = 32;

export function addNode(skill: Skill, type: NodeType, position: Position, preset?: { config?: Record<string, ConfigValue>; name?: string }): { skill: Skill; id: number } {
  const next = cloneSkill(skill);
  const id = nextNodeId(next);
  const node: SkillNode = {
    id,
    type,
    name: preset?.name ?? uniqueName(next, defaultName(type)),
    config: { ...defaultConfig(type), ...(preset?.config ?? {}) },
    body: '',
    stages: [],
  };
  next.nodes.push(node);
  next.layout[String(id)] = { x: Math.round(position.x), y: Math.round(position.y) };
  return { skill: next, id };
}

function uniqueName(skill: Skill, base: string): string {
  const names = new Set(skill.nodes.map((node) => node.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let counter = 2;
  while (names.has(`${base} ${counter}`.toLowerCase())) counter += 1;
  return `${base} ${counter}`;
}

export function updateNode(skill: Skill, id: number, patch: Partial<Omit<SkillNode, 'id'>>): Skill {
  const next = cloneSkill(skill);
  const node = next.nodes.find((candidate) => candidate.id === id);
  if (!node) return skill;
  const renamed = patch.name !== undefined && patch.name !== node.name;
  Object.assign(node, patch);
  if (patch.type && patch.type !== skill.nodes.find((candidate) => candidate.id === id)?.type) {
    // A type change keeps name/body but drops edges whose handles no longer exist.
    const handles = new Set(outputHandles(node).map((handle) => handle.id));
    next.edges = next.edges.filter((edge) => edge.from !== id || handles.has(edge.handle));
    if (!NODE_META[patch.type].hasInput) next.edges = next.edges.filter((edge) => edge.to !== id);
    const allowed = new Set(NODE_META[patch.type].fields.map((field) => field.key));
    const config: Record<string, ConfigValue> = { ...defaultConfig(patch.type) };
    for (const [key, value] of Object.entries(node.config)) if (allowed.has(key)) config[key] = value;
    node.config = config;
  }
  // Switch cases removed → their edges go too.
  if (patch.config && node.type === 'switch') {
    const handles = new Set(outputHandles(node).map((handle) => handle.id));
    next.edges = next.edges.filter((edge) => edge.from !== id || handles.has(edge.handle));
  }
  // A rename has to travel to every ${id: name} that points here.
  return renamed ? normalizeRefs(next) : next;
}

export interface ConnectResult {
  skill: Skill;
  ok: boolean;
  reason?: string;
}

export function connect(skill: Skill, from: number, handle: string, to: number): ConnectResult {
  const source = skill.nodes.find((node) => node.id === from);
  const target = skill.nodes.find((node) => node.id === to);
  if (!source || !target) return { skill, ok: false, reason: 'Unknown node.' };
  if (from === to) return { skill, ok: false, reason: 'A node cannot connect to itself.' };
  if (!NODE_META[target.type].hasInput) return { skill, ok: false, reason: 'Nothing can point at Start.' };
  if (!outputHandles(source).some((candidate) => candidate.id === handle)) return { skill, ok: false, reason: `No "${handle}" output on this node.` };
  if (skill.edges.some((edge) => edge.from === from && edge.handle === handle && edge.to === to)) return { skill, ok: false, reason: 'Already connected.' };
  const next = cloneSkill(skill);
  next.edges.push({ from, handle, to });
  return { skill: next, ok: true };
}

export function disconnect(skill: Skill, edge: Edge): Skill {
  const next = cloneSkill(skill);
  next.edges = next.edges.filter((candidate) => !(candidate.from === edge.from && candidate.handle === edge.handle && candidate.to === edge.to));
  return next;
}

export function edgeId(edge: Edge): string {
  return `${edge.from}:${edge.handle}:${edge.to}`;
}

export function parseEdgeId(id: string): Edge | null {
  const match = /^(\d+):(.+):(\d+)$/.exec(id);
  return match ? { from: Number(match[1]), handle: match[2]!, to: Number(match[3]) } : null;
}

/** Removes nodes and notes. A node with exactly one arrow in and one out is bridged, as n8n does. */
export function removeItems(skill: Skill, ids: string[]): Skill {
  const next = cloneSkill(skill);
  const nodeIds = new Set(ids.filter((id) => /^\d+$/.test(id)).map(Number));
  const noteIds = new Set(ids.filter((id) => !/^\d+$/.test(id)));
  for (const id of nodeIds) {
    const incoming = next.edges.filter((edge) => edge.to === id && !nodeIds.has(edge.from));
    const outgoing = next.edges.filter((edge) => edge.from === id && !nodeIds.has(edge.to));
    if (incoming.length === 1 && outgoing.length === 1) {
      const bridge: Edge = { from: incoming[0]!.from, handle: incoming[0]!.handle, to: outgoing[0]!.to };
      if (bridge.from !== bridge.to && !next.edges.some((edge) => edge.from === bridge.from && edge.handle === bridge.handle && edge.to === bridge.to)) next.edges.push(bridge);
    }
  }
  next.nodes = next.nodes.filter((node) => !nodeIds.has(node.id));
  next.edges = next.edges.filter((edge) => !nodeIds.has(edge.from) && !nodeIds.has(edge.to));
  next.notes = next.notes.filter((note) => !noteIds.has(note.id)).map((note) => (note.attachedTo !== null && nodeIds.has(note.attachedTo) ? { ...note, attachedTo: null } : note));
  for (const id of ids) delete next.layout[id];
  return next;
}

export function moveItems(skill: Skill, positions: Record<string, Position>): Skill {
  const next = cloneSkill(skill);
  for (const [id, position] of Object.entries(positions)) next.layout[id] = { x: Math.round(position.x), y: Math.round(position.y) };
  return next;
}

export function addNote(skill: Skill, position: Position, attachedTo: number | null = null, text = ''): { skill: Skill; id: string } {
  const next = cloneSkill(skill);
  let counter = next.notes.length + 1;
  while (next.notes.some((note) => note.id === `n${counter}`)) counter += 1;
  const id = `n${counter}`;
  next.notes.push({ id, text, attachedTo, color: '' });
  next.layout[id] = { x: Math.round(position.x), y: Math.round(position.y) };
  return { skill: next, id };
}

export function updateNote(skill: Skill, id: string, patch: Partial<Omit<Note, 'id'>>): Skill {
  const next = cloneSkill(skill);
  const note = next.notes.find((candidate) => candidate.id === id);
  if (!note) return skill;
  Object.assign(note, patch);
  return next;
}

export interface Clip {
  nodes: SkillNode[];
  notes: Note[];
  edges: Edge[];
  layout: Record<string, Position>;
}

export function copyItems(skill: Skill, ids: string[]): Clip {
  const nodeIds = new Set(ids.filter((id) => /^\d+$/.test(id)).map(Number));
  const noteIds = new Set(ids.filter((id) => !/^\d+$/.test(id)));
  const nodes = skill.nodes.filter((node) => nodeIds.has(node.id) && node.type !== 'start');
  const kept = new Set(nodes.map((node) => node.id));
  const notes = skill.notes.filter((note) => noteIds.has(note.id));
  const edges = skill.edges.filter((edge) => kept.has(edge.from) && kept.has(edge.to));
  const layout: Record<string, Position> = {};
  for (const node of nodes) layout[String(node.id)] = skill.layout[String(node.id)] ?? { x: 0, y: 0 };
  for (const note of notes) layout[note.id] = skill.layout[note.id] ?? { x: 0, y: 0 };
  return { nodes: JSON.parse(JSON.stringify(nodes)) as SkillNode[], notes: JSON.parse(JSON.stringify(notes)) as Note[], edges: [...edges], layout };
}

/** Pastes a clip with fresh ids, references renumbered, at an offset (or around a point). */
export function pasteItems(skill: Skill, clip: Clip, at?: Position): { skill: Skill; ids: string[] } {
  const next = cloneSkill(skill);
  const idMap = new Map<number, number>();
  let counter = nextNodeId(next);
  for (const node of clip.nodes) {
    idMap.set(node.id, counter);
    counter += 1;
  }
  const positions = Object.values(clip.layout);
  const minX = Math.min(...positions.map((pos) => pos.x), 0);
  const minY = Math.min(...positions.map((pos) => pos.y), 0);
  const offset = at ? { x: at.x - minX, y: at.y - minY } : { x: PASTE_OFFSET, y: PASTE_OFFSET };
  const ids: string[] = [];
  for (const node of clip.nodes) {
    const id = idMap.get(node.id)!;
    const renumbered = renumberRefs({ ...JSON.parse(JSON.stringify(node)), id }, idMap) as SkillNode;
    renumbered.stages = renumbered.stages.map((stage, index) => ({ ...stage, id: `${id}.${index + 1}` }));
    next.nodes.push(renumbered);
    const pos = clip.layout[String(node.id)] ?? { x: 0, y: 0 };
    next.layout[String(id)] = { x: pos.x + offset.x, y: pos.y + offset.y };
    ids.push(String(id));
  }
  for (const edge of clip.edges) next.edges.push({ from: idMap.get(edge.from)!, handle: edge.handle, to: idMap.get(edge.to)! });
  // Copies get fresh names, so their labels are refreshed below.
  let noteCounter = next.notes.length + 1;
  for (const note of clip.notes) {
    while (next.notes.some((candidate) => candidate.id === `n${noteCounter}`)) noteCounter += 1;
    const id = `n${noteCounter}`;
    noteCounter += 1;
    const attachedTo = note.attachedTo !== null ? (idMap.get(note.attachedTo) ?? null) : null;
    next.notes.push({ id, text: note.text, attachedTo, color: note.color });
    const pos = clip.layout[note.id] ?? { x: 0, y: 0 };
    next.layout[id] = { x: pos.x + offset.x, y: pos.y + offset.y };
    ids.push(id);
  }
  return { skill: normalizeRefs(next), ids };
}

export function selectAllIds(skill: Skill): string[] {
  return [...skill.nodes.map((node) => String(node.id)), ...skill.notes.map((note) => note.id)];
}

/** Nodes that can feed a reference into `id`: everything upstream, in id order. */
export function upstreamNodes(skill: Skill, id: number): SkillNode[] {
  const result = new Set<number>();
  const stack = skill.edges.filter((edge) => edge.to === id).map((edge) => edge.from);
  while (stack.length) {
    const current = stack.pop()!;
    if (result.has(current) || current === id) continue;
    result.add(current);
    for (const edge of skill.edges) if (edge.to === current) stack.push(edge.from);
  }
  return skill.nodes.filter((node) => result.has(node.id)).sort((a, b) => a.id - b.id);
}
