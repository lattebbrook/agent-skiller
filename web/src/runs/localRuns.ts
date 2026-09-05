/**
 * Test runs without a server: the same walker from core, kept in memory. You
 * play the agent, and for a Code step you also play the sandbox: the code is
 * shown and you paste what it printed. Nothing executes in the page.
 */
import { advance, startRun, validateSkill, hasErrors, type RunState, type Skill, type StepEvent, type StepView } from '@agent-skiller/core';
import type { RunView } from '../api.js';

interface LocalRun {
  id: string;
  skillName: string;
  skill: Skill;
  state: RunState;
  step: StepView | null;
  createdAt: number;
  updatedAt: number;
}

const runs = new Map<string, LocalRun>();

function view(run: LocalRun): RunView {
  return {
    id: run.id,
    skillName: run.skillName,
    status: run.state.status,
    step: run.step,
    subSkillMarkdown: '',
    result: run.state.result,
    error: run.state.error,
    steps: run.state.steps,
    codeResults: [],
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export const localRuns = {
  start(skill: Skill, input: unknown): RunView {
    const problems = validateSkill(skill);
    if (hasErrors(problems)) {
      const list = problems.filter((problem) => problem.severity === 'error').map((problem) => `${problem.nodeId ? `node ${problem.nodeId}: ` : ''}${problem.message}`);
      throw new Error(`"${skill.name}" has errors and cannot run:\n- ${list.join('\n- ')}`);
    }
    const { state, step } = startRun(skill, input);
    const run: LocalRun = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, skillName: skill.name, skill, state, step, createdAt: Date.now(), updatedAt: Date.now() };
    runs.set(run.id, run);
    return view(run);
  },

  next(id: string, event: StepEvent): RunView {
    const run = runs.get(id);
    if (!run) throw new Error(`No run with id "${id}".`);
    if (run.state.status !== 'running' || !run.step) return view(run);
    const { state, step } = advance(run.skill, run.state, event);
    run.state = state;
    run.step = step;
    run.updatedAt = Date.now();
    return view(run);
  },

  list(): RunView[] {
    return [...runs.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(view);
  },

  get(id: string): RunView | null {
    const run = runs.get(id);
    return run ? view(run) : null;
  },

  /** Tests only. */
  reset(): void {
    runs.clear();
  },
};
