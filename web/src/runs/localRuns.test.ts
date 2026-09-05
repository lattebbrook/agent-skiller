import { beforeEach, describe, expect, it } from 'vitest';
import { parseMarkdown } from '@agent-skiller/core';
import { localRuns } from './localRuns.js';

const SKILL = parseMarkdown(`---
name: t
description: d
---
# T

## 1. Start
- next: 2

## 2. If: Ready?
- yes: 3
- no: 4

## 3. Code: Count
\`\`\`python
print(3)
\`\`\`
- next: 5

## 4. End: Not ready
Say no.

## 5. End: Done
Report \${3: Count}.
`).skill;

beforeEach(() => localRuns.reset());

describe('localRuns', () => {
  it('walks a skill in memory, handing Code steps to the person', () => {
    let run = localRuns.start(SKILL, 'go');
    expect(run.status).toBe('running');
    expect(run.step?.nodeId).toBe(2);
    run = localRuns.next(run.id, { status: 'ok', choose: 'yes' });
    // No sandbox here: the code step is presented, not executed.
    expect(run.step?.type).toBe('code');
    expect(run.step?.code?.code).toBe('print(3)');
    run = localRuns.next(run.id, { status: 'ok', output: 3 });
    expect(run.step?.nodeId).toBe(5);
    expect(run.step?.instruction).toBe('Report 3.');
    run = localRuns.next(run.id, { status: 'ok', output: 'three' });
    expect(run.status).toBe('done');
    expect(localRuns.list()).toHaveLength(1);
  });

  it('refuses a skill with errors', () => {
    const broken = parseMarkdown(`# B\n\n## 1. Start\n- next: 2\n\n## 2. If: Q\n- yes: 3\n\n## 3. End\n`).skill;
    expect(() => localRuns.start(broken, null)).toThrow(/goes nowhere/);
  });
});
