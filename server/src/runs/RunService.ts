/**
 * Holds live runs and drives the core walker. Code steps are executed here
 * (through the sandbox) so an agent only ever sees steps it must perform.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  advance,
  startRun,
  validateSkill,
  hasErrors,
  type RunState,
  type Skill,
  type StepEvent,
  type StepView,
} from '@agent-skiller/core';
import type { FileStore } from '../workspace/files.js';
import type { SandboxRequest, SandboxResult } from '../sandbox/run.js';

export interface Run {
  id: string;
  skillName: string;
  skillPath: string;
  skill: Skill;
  state: RunState;
  step: StepView | null;
  /** Markdown of the sub-skill named by the current step, when it exists. */
  subSkillMarkdown: string;
  codeResults: { nodeId: number; result: SandboxResult }[];
  createdAt: number;
  updatedAt: number;
}

export interface RunView {
  id: string;
  skillName: string;
  status: RunState['status'];
  step: StepView | null;
  subSkillMarkdown: string;
  result: unknown;
  error: string;
  steps: RunState['steps'];
  codeResults: Run['codeResults'];
  createdAt: number;
  updatedAt: number;
}

export class RunNotFound extends Error {}

export class RunService {
  private readonly runs = new Map<string, Run>();

  constructor(
    private readonly files: FileStore,
    private readonly sandbox: (request: SandboxRequest) => Promise<SandboxResult>,
    private readonly runsDir: string,
  ) {}

  async start(skillName: string, input: unknown): Promise<RunView> {
    const found = await this.files.findSkill(skillName);
    if (!found) throw new RunNotFound(`No skill named "${skillName}" in the workspace.`);
    const problems = validateSkill(found.skill);
    if (hasErrors(problems)) {
      const list = problems.filter((problem) => problem.severity === 'error').map((problem) => `${problem.nodeId ? `node ${problem.nodeId}: ` : ''}${problem.message}`);
      throw new Error(`"${found.skill.name}" has errors and cannot run:\n- ${list.join('\n- ')}`);
    }
    const { state, step } = startRun(found.skill, input);
    const run: Run = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      skillName: found.skill.name,
      skillPath: found.path,
      skill: found.skill,
      state,
      step,
      subSkillMarkdown: '',
      codeResults: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.runs.set(run.id, run);
    await this.settle(run);
    return this.view(run);
  }

  async next(runId: string, event: StepEvent): Promise<RunView> {
    const run = this.get(runId);
    if (run.state.status !== 'running' || !run.step) return this.view(run);
    const { state, step } = advance(run.skill, run.state, event);
    run.state = state;
    run.step = step;
    await this.settle(run);
    return this.view(run);
  }

  get(runId: string): Run {
    const run = this.runs.get(runId);
    if (!run) throw new RunNotFound(`No run with id "${runId}".`);
    return run;
  }

  list(): RunView[] {
    return [...this.runs.values()].sort((a, b) => b.updatedAt - a.updatedAt).map((run) => this.view(run));
  }

  view(run: Run): RunView {
    return {
      id: run.id,
      skillName: run.skillName,
      status: run.state.status,
      step: run.step,
      subSkillMarkdown: run.subSkillMarkdown,
      result: run.state.result,
      error: run.state.error,
      steps: run.state.steps,
      codeResults: run.codeResults,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  /** Executes code steps until the walker lands on something an agent must do. */
  private async settle(run: Run): Promise<void> {
    let guard = 0;
    while (run.step && run.step.type === 'code' && run.step.code && guard < 50) {
      guard += 1;
      const result = await this.sandbox({ language: run.step.code.language, code: run.step.code.code, input: run.step.code.input });
      run.codeResults.push({ nodeId: run.step.nodeId, result });
      const ok = result.exitStatus === 0 && !result.timedOut;
      const message = result.timedOut ? `Timed out after ${result.limits.timeoutSeconds}s.` : ok ? '' : `Exit ${result.exitStatus}: ${result.stderr.slice(0, 500)}`;
      const { state, step } = advance(run.skill, run.state, { status: ok ? 'ok' : 'fail', output: ok ? result.output : result.stderr, message });
      run.state = state;
      run.step = step;
    }
    run.subSkillMarkdown = '';
    if (run.step?.subSkill) {
      const sub = await this.files.findSkill(run.step.subSkill);
      if (sub) run.subSkillMarkdown = sub.text;
    }
    run.updatedAt = Date.now();
    await this.persist(run);
  }

  private async persist(run: Run): Promise<void> {
    try {
      await fs.mkdir(this.runsDir, { recursive: true });
      await fs.writeFile(join(this.runsDir, `${run.id}.json`), JSON.stringify(this.view(run), null, 2), 'utf8');
    } catch {
      // The run still lives in memory; the dump is a convenience.
    }
  }
}
