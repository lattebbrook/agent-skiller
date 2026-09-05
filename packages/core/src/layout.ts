/**
 * Auto-layout with dagre, left to right. Used on import when a file carries
 * no layout comment, and by the "auto-layout" button.
 */
import dagre from '@dagrejs/dagre';
import type { Position, Skill } from './model.js';

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 64;
export const NOTE_WIDTH = 180;
export const NOTE_HEIGHT = 96;

export function autoLayout(skill: Skill, sizes: Record<string, { width: number; height: number }> = {}): Record<string, Position> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 90, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of skill.nodes) {
    const size = sizes[String(node.id)] ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    graph.setNode(String(node.id), size);
  }
  for (const edge of skill.edges) graph.setEdge(String(edge.from), String(edge.to));
  dagre.layout(graph);
  const layout: Record<string, Position> = {};
  for (const node of skill.nodes) {
    const placed = graph.node(String(node.id));
    const size = sizes[String(node.id)] ?? { width: NODE_WIDTH, height: NODE_HEIGHT };
    layout[String(node.id)] = { x: Math.round(placed.x - size.width / 2), y: Math.round(placed.y - size.height / 2) };
  }
  // Notes sit under the node they annotate, or in a row below everything.
  let freeIndex = 0;
  const bottom = Math.max(0, ...Object.values(layout).map((pos) => pos.y)) + NODE_HEIGHT + 60;
  for (const note of skill.notes) {
    const anchor = note.attachedTo === null ? undefined : layout[String(note.attachedTo)];
    if (anchor) layout[note.id] = { x: anchor.x, y: anchor.y + NODE_HEIGHT + 24 };
    else {
      layout[note.id] = { x: 20 + freeIndex * (NOTE_WIDTH + 24), y: bottom };
      freeIndex += 1;
    }
  }
  return layout;
}

/** Fills in positions for anything the layout does not cover, without moving what it does. */
export function completeLayout(skill: Skill): Record<string, Position> {
  const missing = skill.nodes.some((node) => !skill.layout[String(node.id)]) || skill.notes.some((note) => !skill.layout[note.id]);
  if (!missing) return skill.layout;
  if (Object.keys(skill.layout).length === 0) return autoLayout(skill);
  const computed = autoLayout(skill);
  const result: Record<string, Position> = { ...skill.layout };
  const maxX = Math.max(0, ...Object.values(skill.layout).map((pos) => pos.x));
  for (const key of Object.keys(computed)) {
    if (!result[key]) result[key] = { x: maxX + NODE_WIDTH + 60, y: computed[key]!.y };
  }
  return result;
}
