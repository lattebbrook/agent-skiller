/**
 * Structural checks. Errors block export and runs; warnings only inform.
 */
import type { Skill } from './model.js';
import { NODE_META, asList, outputHandles } from './nodeTypes.js';
import { nodeRefs } from './refs.js';

export interface Problem {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: number;
}

export function validateSkill(skill: Skill): Problem[] {
  const problems: Problem[] = [];
  const push = (severity: Problem['severity'], code: string, message: string, nodeId?: number) =>
    problems.push(nodeId === undefined ? { severity, code, message } : { severity, code, message, nodeId });

  const starts = skill.nodes.filter((node) => node.type === 'start');
  if (starts.length === 0) push('error', 'no-start', 'The skill needs a Start node.');
  if (starts.length > 1) for (const start of starts.slice(1)) push('error', 'many-starts', 'Only one Start node is allowed.', start.id);

  if (!skill.name.trim()) push('warning', 'no-name', 'The skill has no name.');
  if (!skill.description.trim()) push('warning', 'no-description', 'Add a one-line description so agents know when to use this skill.');

  const ids = new Set(skill.nodes.map((node) => node.id));
  const seenNames = new Map<string, number>();
  for (const node of skill.nodes) {
    const key = node.name.trim().toLowerCase();
    if (!key) push('warning', 'empty-name', 'This node has no name.', node.id);
    else if (seenNames.has(key)) push('warning', 'duplicate-name', `Another node is also called "${node.name}".`, node.id);
    else seenNames.set(key, node.id);
  }

  const start = starts[0];
  const reachable = new Set<number>();
  if (start) {
    const stack = [start.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const edge of skill.edges) if (edge.from === id) stack.push(edge.to);
    }
    for (const node of skill.nodes) {
      if (!reachable.has(node.id)) push('warning', 'unreachable', 'This node cannot be reached from Start.', node.id);
    }
  }

  for (const node of skill.nodes) {
    const meta = NODE_META[node.type];
    const outgoing = skill.edges.filter((edge) => edge.from === node.id);
    const handles = outputHandles(node);
    const connected = new Set(outgoing.map((edge) => edge.handle));
    for (const edge of outgoing) {
      if (!handles.some((handle) => handle.id === edge.handle)) push('error', 'unknown-handle', `Output "${edge.handle}" does not exist on a ${meta.label} node.`, node.id);
      if (!ids.has(edge.to)) push('error', 'dangling-edge', `An arrow points to node ${edge.to}, which does not exist.`, node.id);
      const target = skill.nodes.find((candidate) => candidate.id === edge.to);
      if (target?.type === 'start') push('error', 'edge-into-start', 'Nothing can point at Start.', node.id);
    }
    for (const handle of handles) {
      if (connected.has(handle.id)) continue;
      switch (node.type) {
        case 'start':
          push('error', 'start-unconnected', 'Start must lead somewhere.', node.id);
          break;
        case 'if':
        case 'confirm':
          push('error', 'branch-unconnected', `The "${handle.label}" branch goes nowhere. Connect it or end it with an End node.`, node.id);
          break;
        case 'switch':
          push(handle.id === 'default' ? 'warning' : 'error', 'branch-unconnected', `The "${handle.label}" case goes nowhere.`, node.id);
          break;
        case 'code':
        case 'command':
        case 'request':
          if (handle.id === 'next') push('warning', 'ends-silently', 'Nothing follows this step; the skill ends here without an End node.', node.id);
          break;
        default:
          push('warning', 'ends-silently', 'Nothing follows this step; the skill ends here without an End node.', node.id);
      }
    }
    if (node.type === 'code') {
      if (!node.body.trim()) push('error', 'code-empty', 'This Code node has no code.', node.id);
      const language = String(node.config['language'] ?? 'python');
      if (!['python', 'javascript'].includes(language)) push('error', 'code-language', `Unsupported language "${language}". Use python or javascript.`, node.id);
    }
    if (node.type === 'command' && !node.body.trim()) push('error', 'command-empty', 'This Command node has no command.', node.id);
    if (node.type === 'text' && !node.body.trim()) push('error', 'text-empty', 'This Text node has no text to check.', node.id);
    if (node.type === 'request' && !String(node.config['url'] ?? '').trim()) push('warning', 'request-no-url', 'This Request has no URL.', node.id);
    if (node.type === 'web' && !String(node.config['url'] ?? '').trim()) push('warning', 'web-no-url', 'This Web step has no URL; the agent will have to find the page itself.', node.id);
    if (node.type === 'switch' && asList(node.config['cases']).length === 0) push('warning', 'switch-no-cases', 'This Switch has no cases yet. Add one per possible answer.', node.id);
    if (node.type === 'skill' && !node.name.trim()) push('error', 'skill-no-target', 'Name the skill to run.', node.id);
    if (meta.hasBody && !node.body.trim() && (node.type === 'do' || node.type === 'ask' || node.type === 'confirm' || node.type === 'loop' || node.type === 'end' || node.type === 'error' || node.type === 'web' || node.type === 'file')) {
      push('warning', 'empty-body', 'This node has no instruction text.', node.id);
    }

    const upstream = ancestorsOf(skill, node.id);
    for (const ref of nodeRefs(node)) {
      if (ref.nodeId === null) {
        if (ref.keyword === null) push('error', 'unknown-ref', `Reference ${ref.raw} does not match any node.`, node.id);
        continue;
      }
      if (!ids.has(ref.nodeId)) push('error', 'unknown-ref', `Reference ${ref.raw} points to a node that does not exist.`, node.id);
      else if (ref.nodeId !== node.id && !upstream.has(ref.nodeId)) push('warning', 'ref-not-upstream', `${ref.raw} is not on the path before this node, so it may have no value yet.`, node.id);
    }
  }

  // Cycles: arrows must not lead back; a Loop is a single step, not a back-edge.
  const color = new Map<number, 'gray' | 'black'>();
  const visit = (id: number) => {
    color.set(id, 'gray');
    for (const edge of skill.edges) {
      if (edge.from !== id) continue;
      const state = color.get(edge.to);
      if (state === 'gray') push('error', 'cycle', `This arrow leads back on itself (${edge.from} → ${edge.to}). Use a Loop node to repeat something.`, edge.from);
      else if (!state && ids.has(edge.to)) visit(edge.to);
    }
    color.set(id, 'black');
  };
  for (const node of skill.nodes) if (!color.has(node.id)) visit(node.id);

  return problems;
}

/** Every node that can reach the given node. */
export function ancestorsOf(skill: Skill, id: number): Set<number> {
  const result = new Set<number>();
  const stack = skill.edges.filter((edge) => edge.to === id).map((edge) => edge.from);
  while (stack.length) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    for (const edge of skill.edges) if (edge.to === current) stack.push(edge.from);
  }
  return result;
}

export function hasErrors(problems: Problem[]): boolean {
  return problems.some((problem) => problem.severity === 'error');
}
