import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptySkill, fromJson, parseMarkdown, serializeMarkdown, toJson, type Skill } from '../src/index.js';

const EXAMPLES = join(__dirname, '..', '..', '..', 'examples');
const canonicalExamples = readdirSync(EXAMPLES).filter((file) => file.endsWith('.md') && !file.startsWith('plain'));

describe('markdown round trip', () => {
  for (const file of canonicalExamples) {
    it(`serialize(parse(${file})) is identical to the file`, () => {
      const text = readFileSync(join(EXAMPLES, file), 'utf8');
      const { skill, diagnostics } = parseMarkdown(text);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(serializeMarkdown(skill)).toBe(text);
    });
    it(`parse(serialize(parse(${file}))) deep-equals the model`, () => {
      const { skill } = parseMarkdown(readFileSync(join(EXAMPLES, file), 'utf8'));
      expect(parseMarkdown(serializeMarkdown(skill)).skill).toEqual(skill);
    });
    it(`json round trip of ${file}`, () => {
      const { skill } = parseMarkdown(readFileSync(join(EXAMPLES, file), 'utf8'));
      expect(fromJson(toJson(skill)).skill).toEqual(skill);
    });
  }

  it('an empty skill round-trips', () => {
    const skill = createEmptySkill('demo');
    expect(parseMarkdown(serializeMarkdown(skill)).skill).toEqual(skill);
  });
});

describe('parse details', () => {
  const { skill } = parseMarkdown(readFileSync(join(EXAMPLES, 'summarize-inbox.md'), 'utf8'));
  const node = (id: number) => skill.nodes.find((n) => n.id === id)!;

  it('reads frontmatter', () => {
    expect(skill.name).toBe('summarize-inbox');
    expect(skill.tags).toEqual(['mail', 'summary']);
    expect(skill.title).toBe('Summarize inbox');
    expect(skill.purpose).toMatch(/^Use this when/);
  });
  it('reads types, names and the few settings that exist', () => {
    expect(node(1).type).toBe('start');
    expect(node(1).config['when']).toEqual(['summarize my inbox', "what's new in mail"]);
    expect(node(2).type).toBe('do');
    expect(node(2).name).toBe('Open inbox');
    expect(node(3).type).toBe('if');
    expect(node(3).name).toBe('Any unread messages?');
    expect(node(3).body).toContain('${2: Open inbox}');
    expect(node(4).type).toBe('loop');
    expect(node(4).name).toBe('For each unread message in ${2: Open inbox}');
    expect(node(4).config).toEqual({});
  });
  it('reads edges including named handles', () => {
    expect(skill.edges).toContainEqual({ from: 3, handle: 'yes', to: 4 });
    expect(skill.edges).toContainEqual({ from: 3, handle: 'no', to: 7 });
    expect(skill.edges).toContainEqual({ from: 5, handle: 'fail', to: 8 });
  });
  it('unfences code and takes the language from the fence', () => {
    expect(node(5).body).toMatch(/^import json, sys/);
    expect(node(5).body).not.toContain('```');
    expect(node(5).config).toEqual({ language: 'python' });
  });
  it('reads notes and layout', () => {
    expect(skill.notes).toEqual([{ id: 'n1', text: 'Some clients show unread as a blue dot rather than bold text.', attachedTo: 3 }]);
    expect(skill.layout['4']).toEqual({ x: 780, y: -90 });
    expect(skill.layout['n1']).toEqual({ x: 520, y: 90 });
  });
});

describe('stages, switch cases and free notes', () => {
  const { skill } = parseMarkdown(readFileSync(join(EXAMPLES, 'file-triage.md'), 'utf8'));
  it('reads stages', () => {
    const unpack = skill.nodes.find((n) => n.id === 6)!;
    expect(unpack.stages.map((s) => s.id)).toEqual(['6.1', '6.2']);
    expect(unpack.stages[1]!.name).toBe('Clean up');
    expect(unpack.body).toBe('');
  });
  it('derives switch cases from the case arrows', () => {
    const sw = skill.nodes.find((n) => n.id === 3)!;
    expect(sw.config['cases']).toEqual(['pdf', 'png', 'zip']);
    expect(skill.edges).toContainEqual({ from: 3, handle: 'case:pdf', to: 4 });
    expect(skill.edges).toContainEqual({ from: 3, handle: 'default', to: 7 });
  });
  it('keeps an unconnected case as "- case x: none"', () => {
    const md = `# T\n\n## 1. Start\n- next: 2\n\n## 2. Switch: Which?\n- case a: 3\n- case b: none\n- default: 3\n\n## 3. End\n`;
    const { skill: parsed } = parseMarkdown(md);
    expect(parsed.nodes[1]!.config['cases']).toEqual(['a', 'b']);
    expect(serializeMarkdown(parsed)).toContain('- case b: none');
  });
  it('reads a free note', () => {
    expect(skill.notes[0]!.attachedTo).toBeNull();
  });
});

describe('tolerance', () => {
  it('normalises bare and name references to the full ${id: name} form', () => {
    const md = `# T\n\n## 1. Start\n- next: 2\n\n## 2. Do: Open inbox\nx\n- next: 3\n\n## 3. Loop: For each item in \${Open inbox}\nUse \${2} and \${open inbox.subject}.\n`;
    const { skill } = parseMarkdown(md);
    expect(skill.nodes[2]!.name).toBe('For each item in ${2: Open inbox}');
    expect(skill.nodes[2]!.body).toBe('Use ${2: Open inbox} and ${2.subject: Open inbox}.');
  });
  it('refreshes a stale label from the node it points at', () => {
    const md = `# T\n\n## 1. Start\n- next: 2\n\n## 2. Do: Open inbox\nx\n- next: 3\n\n## 3. End\nUse \${2: The Old Name}.\n`;
    expect(parseMarkdown(md).skill.nodes[2]!.body).toBe('Use ${2: Open inbox}.');
  });
  it('drops the label when the node it named is gone', () => {
    const md = `# T\n\n## 1. Start\n- next: 2\n\n## 2. End\nUse \${9: Missing}.\n`;
    expect(parseMarkdown(md).skill.nodes[1]!.body).toBe('Use ${9}.');
  });
  it('keeps unknown "- key: value" lines as body text', () => {
    const md = `# T\n\n## 1. Start\n- next: 2\n\n## 2. Do: Step\n- priority: high\nDo it.\n`;
    const { skill } = parseMarkdown(md);
    expect(skill.nodes[1]!.body).toBe('- priority: high\nDo it.');
    expect(skill.nodes[1]!.config).toEqual({});
  });
  it('adds a Start when missing and reports it', () => {
    const md = `# T\n\n## 1. Do: Only step\nDo it.\n`;
    const { skill, diagnostics } = parseMarkdown(md);
    expect(skill.nodes[0]!.type).toBe('start');
    expect(skill.edges).toEqual([{ from: 2, handle: 'next', to: 1 }]);
    expect(diagnostics.some((d) => /Start/.test(d.message))).toBe(true);
  });
  it('reports edges to unknown nodes and drops them', () => {
    const { skill, diagnostics } = parseMarkdown(`# T\n\n## 1. Start\n- next: 9\n`);
    expect(skill.edges).toEqual([]);
    expect(diagnostics[0]!.severity).toBe('error');
  });
  it('accepts a bare "## 2. Open inbox" as a Do node and "## 3. End" as End', () => {
    const md = `# T\n\n## 1. Start\n- next: 2\n\n## 2. Open inbox\nx\n- next: 3\n\n## 3. End\n`;
    const { skill } = parseMarkdown(md);
    expect(skill.nodes[1]!.type).toBe('do');
    expect(skill.nodes[1]!.name).toBe('Open inbox');
    expect(skill.nodes[2]!.type).toBe('end');
  });
  it('does not treat "- next:" inside a code fence as an edge', () => {
    const md = '# T\n\n## 1. Start\n- next: 2\n\n## 2. Code: C\n```python\n# - next: 5\nprint(1)\n```\n- next: 3\n\n## 3. End\n';
    const { skill } = parseMarkdown(md);
    expect(skill.edges.filter((e) => e.from === 2)).toEqual([{ from: 2, handle: 'next', to: 3 }]);
    expect(skill.nodes[1]!.body).toBe('# - next: 5\nprint(1)');
  });
  it('imports a plain document as a chain of Do nodes', () => {
    const { skill, foreign } = parseMarkdown(readFileSync(join(EXAMPLES, 'plain-checklist.md'), 'utf8'));
    expect(foreign).toBe(true);
    expect(skill.title).toBe('Morning laptop check');
    expect(skill.nodes.map((n) => n.type)).toEqual(['start', 'do', 'do', 'do']);
    expect(skill.nodes[2]!.name).toBe('Backups');
    expect(skill.edges).toEqual([
      { from: 1, handle: 'next', to: 2 },
      { from: 2, handle: 'next', to: 3 },
      { from: 3, handle: 'next', to: 4 },
    ]);
  });
  it('serializes a quoted phrase so it reads back identically', () => {
    const skill: Skill = { ...createEmptySkill('q'), nodes: [{ id: 1, type: 'start', name: 'Start', config: { when: ['"hi there"', 'plain'] }, body: '', stages: [] }] };
    const back = parseMarkdown(serializeMarkdown(skill)).skill;
    expect(back.nodes[0]!.config['when']).toEqual(['"hi there"', 'plain']);
  });
});
