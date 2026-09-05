import { describe, expect, it } from 'vitest';
import { createEmptySkill, hasErrors, parseMarkdown, validateSkill, type Skill } from '../src/index.js';

function skillFrom(md: string): Skill {
  return parseMarkdown(md).skill;
}

describe('validateSkill', () => {
  it('passes a clean linear skill', () => {
    const skill = skillFrom(`---\nname: a\ndescription: d\n---\n# A\n\n## 1. Start\n- next: 2\n\n## 2. Do: X\nx\n- next: 3\n\n## 3. End\ndone\n`);
    expect(validateSkill(skill)).toEqual([]);
  });
  it('requires Start to lead somewhere', () => {
    expect(validateSkill(createEmptySkill('x')).map((p) => p.code)).toContain('start-unconnected');
  });
  it('flags a dangling If branch as an error and a silent end as a warning', () => {
    const skill = skillFrom(`# A\n\n## 1. Start\n- next: 2\n\n## 2. If: Q\n- yes: 3\n\n## 3. Do: X\nx\n`);
    const problems = validateSkill(skill);
    expect(problems.find((p) => p.code === 'branch-unconnected')?.severity).toBe('error');
    expect(problems.find((p) => p.code === 'ends-silently')?.severity).toBe('warning');
  });
  it('flags unreachable nodes and unknown references', () => {
    const skill = skillFrom(`# A\n\n## 1. Start\n- next: 2\n\n## 2. End\nUse \${7}.\n\n## 3. Do: Lost\nx\n`);
    const codes = validateSkill(skill).map((p) => p.code);
    expect(codes).toContain('unreachable');
    expect(codes).toContain('unknown-ref');
  });
  it('warns when a reference is not upstream', () => {
    const skill = skillFrom(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Do: First\nUse \${3: End}.\n- next: 3\n\n## 3. End\n`);
    expect(validateSkill(skill).map((p) => p.code)).toContain('ref-not-upstream');
  });
  it('rejects arrows that lead back', () => {
    const skill = skillFrom(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Do: A\nx\n- next: 3\n\n## 3. Do: B\nx\n- next: 2\n`);
    expect(validateSkill(skill).map((p) => p.code)).toContain('cycle');
  });
  it('warns on a Switch without cases and an unconnected case is an error', () => {
    const none = skillFrom(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Switch: Q\n- default: 3\n\n## 3. End\n`);
    expect(validateSkill(none).map((p) => p.code)).toContain('switch-no-cases');
    const dangling = skillFrom(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Switch: Q\n- case a: none\n- default: 3\n\n## 3. End\n`);
    expect(validateSkill(dangling).find((p) => p.code === 'branch-unconnected')?.severity).toBe('error');
  });
  it('requires code in a Code node', () => {
    const skill = skillFrom(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Code: C\n- next: 3\n\n## 3. End\n`);
    const problems = validateSkill(skill);
    expect(problems.map((p) => p.code)).toContain('code-empty');
    expect(hasErrors(problems)).toBe(true);
  });
});
