import { describe, expect, it } from 'vitest';
import { createEmptySkill, parseMarkdown, validateSkill } from '@agent-skiller/core';
import { addNode, addNote, connect, copyItems, disconnect, pasteItems, removeItems, updateNode, updateNote, upstreamNodes } from './skillOps.js';

function linear() {
  return parseMarkdown(`# T\n\n## 1. Start\n- next: 2\n\n## 2. Do: A\nUse \${input}.\n- next: 3\n\n## 3. Do: B\nUse \${2: A}.\n- next: 4\n\n## 4. End\n`).skill;
}

describe('skillOps', () => {
  it('adds nodes with unique names and fresh ids', () => {
    let skill = createEmptySkill('x');
    const first = addNode(skill, 'do', { x: 10, y: 10 });
    skill = first.skill;
    const second = addNode(skill, 'do', { x: 20, y: 20 });
    expect(first.id).toBe(2);
    expect(second.id).toBe(3);
    expect(second.skill.nodes[2]!.name).toBe('Do 2');
    expect(second.skill.layout['3']).toEqual({ x: 20, y: 20 });
  });

  it('applies connection rules', () => {
    const skill = linear();
    expect(connect(skill, 2, 'next', 1).ok).toBe(false);
    expect(connect(skill, 2, 'next', 2).ok).toBe(false);
    expect(connect(skill, 2, 'yes', 3).ok).toBe(false);
    expect(connect(skill, 2, 'next', 3).ok).toBe(false); // duplicate
    const fanOut = connect(skill, 2, 'next', 4);
    expect(fanOut.ok).toBe(true);
    expect(fanOut.skill.edges).toHaveLength(4);
    expect(disconnect(fanOut.skill, { from: 2, handle: 'next', to: 4 }).edges).toHaveLength(3);
  });

  it('bridges arrows when deleting a node in the middle', () => {
    const skill = removeItems(linear(), ['3']);
    expect(skill.nodes.map((node) => node.id)).toEqual([1, 2, 4]);
    expect(skill.edges).toContainEqual({ from: 2, handle: 'next', to: 4 });
    expect(validateSkill(skill).filter((problem) => problem.severity === 'error')).toEqual([]);
  });

  it('changing type drops edges on vanished handles and unknown config', () => {
    const skill = updateNode(linear(), 2, { type: 'if' });
    const node = skill.nodes.find((candidate) => candidate.id === 2)!;
    expect(node.type).toBe('if');
    expect(node.config).toEqual({});
    expect(skill.edges.some((edge) => edge.from === 2)).toBe(false);
  });

  it('copies and pastes with renumbered references and internal edges', () => {
    const skill = linear();
    const clip = copyItems(skill, ['2', '3']);
    const pasted = pasteItems(skill, clip);
    expect(pasted.ids).toEqual(['5', '6']);
    const copyOfB = pasted.skill.nodes.find((node) => node.id === 6)!;
    expect(copyOfB.body).toBe('Use ${5: A}.');
    expect(pasted.skill.edges).toContainEqual({ from: 5, handle: 'next', to: 6 });
    expect(pasted.skill.layout['5']).toEqual({ x: 32, y: 32 });
  });

  it('never copies Start', () => {
    expect(copyItems(linear(), ['1', '2']).nodes.map((node) => node.id)).toEqual([2]);
  });

  it('renaming a node rewrites the label of every reference to it', () => {
    const skill = updateNode(linear(), 2, { name: 'Opened the app' });
    expect(skill.nodes.find((node) => node.id === 3)!.body).toBe('Use ${2: Opened the app}.');
  });

  it('notes start in the default colour and keep a chosen one through paste', () => {
    const withNote = addNote(linear(), { x: 5, y: 5 });
    expect(withNote.skill.notes[0]!.color).toBe('');
    const coloured = updateNote(withNote.skill, withNote.id, { color: 'blue' });
    const pasted = pasteItems(coloured, copyItems(coloured, [withNote.id]));
    expect(pasted.skill.notes[1]!.color).toBe('blue');
  });

  it('lists upstream nodes for the reference chips', () => {
    expect(upstreamNodes(linear(), 3).map((node) => node.id)).toEqual([1, 2]);
    expect(upstreamNodes(linear(), 2).map((node) => node.id)).toEqual([1]);
  });
});
