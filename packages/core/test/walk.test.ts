import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advance, describeStep, parseMarkdown, startRun, type RunState, type Skill, type StepEvent } from '../src/index.js';

const EXAMPLES = join(__dirname, '..', '..', '..', 'examples');
const load = (file: string) => parseMarkdown(readFileSync(join(EXAMPLES, file), 'utf8')).skill;
const md = (text: string): Skill => parseMarkdown(text).skill;

function drive(skill: Skill, input: unknown, script: (step: NonNullable<ReturnType<typeof startRun>['step']>, state: RunState) => StepEvent) {
  let { state, step } = startRun(skill, input, 1);
  const visited: number[] = [];
  let guard = 0;
  while (step && guard < 100) {
    visited.push(step.nodeId);
    ({ state, step } = advance(skill, state, script(step, state), 2));
    guard += 1;
  }
  return { state, visited };
}

describe('walker', () => {
  it('walks a linear skill and returns the End result', () => {
    const skill = md(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Do: One\nDo one.\n- next: 3\n\n## 3. End: Done\nReport \${2: One}.\n`);
    const seen: string[] = [];
    const { state, visited } = drive(skill, 'in', (step) => {
      seen.push(step.instruction);
      return step.type === 'end' ? { status: 'ok' } : { status: 'ok', output: 'one-done' };
    });
    expect(visited).toEqual([2, 3]);
    expect(seen[1]).toBe('Report one-done.');
    expect(state.status).toBe('done');
    expect(state.result).toBe('Report one-done.');
  });

  it('substitutes references in instructions and headings', () => {
    const skill = md(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Do: One\nGot \${input}.\n- next: 3\n\n## 3. Loop: For each of \${2: One}\nAfter \${2: One} and \${2.k: One}.\n- next: 4\n\n## 4. End\n`);
    const seen: string[] = [];
    drive(skill, 'hello', (step) => {
      seen.push(`${step.name} | ${step.instruction}`);
      return { status: 'ok', output: step.nodeId === 2 ? { k: 'v', other: 1 } : 'x' };
    });
    expect(seen[0]).toBe('One | Got hello.');
    expect(seen[1]).toBe('For each of {"k":"v","other":1} | After {"k":"v","other":1} and v.');
  });

  it('follows If branches by choice, defaulting to status', () => {
    const skill = md(`# A\n\n## 1. Start\n- next: 2\n\n## 2. If: Q\n- yes: 3\n- no: 4\n\n## 3. End: Yes\n\n## 4. End: No\n`);
    expect(drive(skill, null, () => ({ status: 'ok', choose: 'no' })).visited).toEqual([2, 4]);
    expect(drive(skill, null, () => ({ status: 'ok' })).visited).toEqual([2, 3]);
    expect(drive(skill, null, () => ({ status: 'fail' })).visited).toEqual([2, 4]);
  });

  it('routes Switch by case label, case-insensitively, and offers the choices', () => {
    const skill = load('file-triage.md');
    let choices: string[] = [];
    const { visited } = drive(skill, '/tmp/a.PDF', (step) => {
      if (step.type === 'switch') {
        choices = step.choices;
        return { status: 'ok', choose: 'PDF' };
      }
      return { status: 'ok', output: 'x' };
    });
    expect(choices).toEqual(['pdf', 'png', 'zip', 'default']);
    expect(visited).toEqual([2, 3, 4, 9]);
  });

  it('a failed plain step stops the run; a Code fail arrow catches it', () => {
    const plain = md(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Do: One\nx\n- next: 3\n\n## 3. End\n`);
    const failed = drive(plain, null, () => ({ status: 'fail', message: 'nope' }));
    expect(failed.state.status).toBe('failed');
    expect(failed.state.error).toBe('nope');
    const caught = md(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Code: C\n\`\`\`python\nx\n\`\`\`\n- next: 3\n- fail: 4\n\n## 3. End: Good\n\n## 4. Error: Bad\nIt broke.\n`);
    const { state, visited } = drive(caught, null, () => ({ status: 'fail' }));
    expect(visited).toEqual([2, 4]);
    expect(state.status).toBe('failed');
    expect(state.error).toBe('It broke.');
  });

  it('fans out when one arrow has several targets, in order', () => {
    const skill = md(`# A\n\n## 1. Start\n- next: 2\n\n## 2. Do: Fan\nx\n- next: 3\n- next: 4\n\n## 3. Do: A\nx\n- next: 5\n\n## 4. Do: B\nx\n- next: 5\n\n## 5. End\n`);
    expect(drive(skill, null, () => ({ status: 'ok' })).visited).toEqual([2, 3, 5]);
  });

  it('presents Code steps for the caller with every previous result', () => {
    const skill = load('summarize-inbox.md');
    let { state, step } = startRun(skill, null);
    ({ state, step } = advance(skill, state, { status: 'ok', output: 'inbox' }));
    ({ state, step } = advance(skill, state, { status: 'ok', choose: 'yes' }));
    expect(step?.type).toBe('loop');
    ({ state, step } = advance(skill, state, { status: 'ok', output: [{ sender: 'b' }, { sender: 'a' }] }));
    expect(step?.type).toBe('code');
    expect(step?.code?.language).toBe('python');
    expect(step?.code?.input).toEqual({ input: null, steps: { '1': null, '2': 'inbox', '4': [{ sender: 'b' }, { sender: 'a' }] } });
    ({ state, step } = advance(skill, state, { status: 'fail', output: 'boom' }));
    expect(step?.nodeId).toBe(8);
  });

  it('describes a step for an agent', () => {
    const skill = load('summarize-inbox.md');
    const { step } = startRun(skill, null);
    const text = describeStep(step!);
    expect(text).toContain('Step 2 · Do: Open inbox');
    expect(text).toContain('Open the Mail app.');
  });
});
