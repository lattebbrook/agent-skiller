import { describe, expect, it } from 'vitest';
import { findRefs, makeRef, parseRef, renumberRefs, type SkillNode } from '../src/index.js';

describe('refs', () => {
  it('parses id, labelled, keyed, reserved and unknown references', () => {
    expect(parseRef('2')).toMatchObject({ nodeId: 2, key: null, label: null });
    expect(parseRef('2: Open inbox')).toMatchObject({ nodeId: 2, key: null, label: 'Open inbox' });
    expect(parseRef('#2.subject')).toMatchObject({ nodeId: 2, key: 'subject' });
    expect(parseRef('2.subject: Open inbox')).toMatchObject({ nodeId: 2, key: 'subject', label: 'Open inbox' });
    expect(parseRef('input')).toMatchObject({ nodeId: null, keyword: 'input' });
    expect(parseRef('Open inbox')).toMatchObject({ nodeId: null, keyword: null });
    // A colon inside a bare name belongs to the name, not to a label.
    expect(parseRef('Report: final')).toMatchObject({ nodeId: null, keyword: null, label: null });
  });
  it('finds all references in text', () => {
    expect(findRefs('a ${1: One} b ${2.k} c ${input}').map((r) => r.raw)).toEqual(['${1: One}', '${2.k}', '${input}']);
  });
  it('renumbers references through a map, keeping their labels', () => {
    const node: SkillNode = { id: 9, type: 'loop', name: 'For each ${2: Open inbox}', config: { when: ['${2: Open inbox}'] }, body: 'Use ${2: Open inbox} and ${3.k} and ${input}.', stages: [{ id: '9.1', name: 's', body: '${2: Open inbox}' }] };
    const out = renumberRefs(node, new Map([[2, 12]]));
    expect(out.body).toBe('Use ${12: Open inbox} and ${3.k} and ${input}.');
    expect(out.config['when']).toEqual(['${12: Open inbox}']);
    expect(out.name).toBe('For each ${12: Open inbox}');
    expect(out.stages[0]!.body).toBe('${12: Open inbox}');
  });
  it('makes references that name the node', () => {
    expect(makeRef(4)).toBe('${4}');
    expect(makeRef(4, 'Open inbox')).toBe('${4: Open inbox}');
    expect(makeRef(4, 'Open inbox', 'subject')).toBe('${4.subject: Open inbox}');
    // A name with braces would end the reference early, so it is left off.
    expect(makeRef(4, 'we {brace}')).toBe('${4}');
  });
});
