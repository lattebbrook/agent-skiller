import { describe, expect, it } from 'vitest';
import { parseMarkdown, validateSkill } from '@agent-skiller/core';
import { toFlowEdges, toFlowNodes } from './flowMapping.js';

const skill = parseMarkdown(`# T\n\n## 1. Start\n- next: 2\n\n## 2. Switch: L\n- case a: 3\n- case b: 4\n\n## 3. Do: Body\nx\n- next: 5\n\n## 4. If: Q\n- yes: 5\n\n## 5. End\n\n> Note (on 3): hi\n`).skill;

describe('flowMapping', () => {
  it('maps nodes with handles, selection and problem badges', () => {
    const nodes = toFlowNodes(skill, validateSkill(skill), ['3']);
    const sw = nodes.find((node) => node.id === '2')!;
    expect(sw.type).toBe('skill');
    expect((sw.data as { outputs: { id: string }[] }).outputs.map((handle) => handle.id)).toEqual(['case:a', 'case:b', 'default']);
    expect(nodes.find((node) => node.id === '3')!.selected).toBe(true);
    const ifNode = nodes.find((node) => node.id === '4')!;
    expect((ifNode.data as { severity: string }).severity).toBe('error');
    expect(nodes.find((node) => node.id === 'n1')!.type).toBe('note');
  });
  it('maps edges with labels', () => {
    const edges = toFlowEdges(skill);
    expect(edges.find((edge) => edge.id === '2:case:a:3')!.label).toBe('a');
    expect(edges.find((edge) => edge.id === '1:next:2')!.label).toBeUndefined();
    expect(edges.find((edge) => edge.id === '4:yes:5')!.label).toBe('yes');
  });
});
