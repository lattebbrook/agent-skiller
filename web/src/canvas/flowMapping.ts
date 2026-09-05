/**
 * Skill model → React Flow nodes and edges. Pure, so it is unit-tested.
 */
import type { Edge as FlowEdge, Node as FlowNode } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import { NODE_META, outputHandles, type Problem, type Skill } from '@agent-skiller/core';
import { edgeId } from '../store/skillOps.js';

export interface SkillNodeData extends Record<string, unknown> {
  nodeId: number;
  type: Skill['nodes'][number]['type'];
  name: string;
  preview: string;
  outputs: { id: string; label: string }[];
  hasInput: boolean;
  color: string;
  severity: 'error' | 'warning' | null;
  problemText: string;
}

export interface NoteNodeData extends Record<string, unknown> {
  noteId: string;
  text: string;
  attachedTo: number | null;
}

export type SkillFlowNode = FlowNode<SkillNodeData, 'skill'>;
export type NoteFlowNode = FlowNode<NoteNodeData, 'note'>;

export function toFlowNodes(skill: Skill, problems: Problem[], selected: string[]): (SkillFlowNode | NoteFlowNode)[] {
  const selectedSet = new Set(selected);
  const nodes: (SkillFlowNode | NoteFlowNode)[] = skill.nodes.map((node) => {
    const own = problems.filter((problem) => problem.nodeId === node.id);
    const severity = own.some((problem) => problem.severity === 'error') ? 'error' : own.length ? 'warning' : null;
    const meta = NODE_META[node.type];
    return {
      id: String(node.id),
      type: 'skill',
      position: skill.layout[String(node.id)] ?? { x: 0, y: 0 },
      selected: selectedSet.has(String(node.id)),
      data: {
        nodeId: node.id,
        type: node.type,
        name: node.name,
        preview: previewFor(node),
        outputs: outputHandles(node),
        hasInput: meta.hasInput,
        color: meta.color,
        severity,
        problemText: own.map((problem) => problem.message).join('\n'),
      },
    };
  });
  for (const note of skill.notes) {
    nodes.push({
      id: note.id,
      type: 'note',
      position: skill.layout[note.id] ?? { x: 0, y: 0 },
      selected: selectedSet.has(note.id),
      data: { noteId: note.id, text: note.text, attachedTo: note.attachedTo },
    });
  }
  return nodes;
}

function previewFor(node: Skill['nodes'][number]): string {
  if (node.type === 'start') {
    const when = node.config['when'];
    const list = Array.isArray(when) ? when : when ? [when] : [];
    return list.length ? `when: ${list[0]}${list.length > 1 ? ` +${list.length - 1}` : ''}` : 'manual';
  }
  if (node.type === 'code') return `${String(node.config['language'] ?? 'python')} · ${node.body.split('\n').length} lines`;
  if (node.type === 'skill') return node.body.trim() || `run "${node.name}"`;
  return node.body.trim() || (node.stages.length ? node.stages.map((stage) => stage.name).join(' → ') : '');
}

export function toFlowEdges(skill: Skill): FlowEdge[] {
  return skill.edges.map((edge) => ({
    id: edgeId(edge),
    source: String(edge.from),
    sourceHandle: edge.handle,
    target: String(edge.to),
    targetHandle: 'in',
    type: 'skill',
    label: edge.handle === 'next' ? undefined : edge.handle.startsWith('case:') ? edge.handle.slice(5) : edge.handle,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    data: { edge },
  }));
}
