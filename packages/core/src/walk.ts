/**
 * The run walker: a pure state machine that guides an agent through a skill
 * one step at a time. The server wraps it in MCP tools; nothing here does I/O.
 *
 *   startRun(skill, input)            → first step
 *   advance(skill, state, event)      → next step (or a finished state)
 *
 * The agent performs each step and reports { status, output, choose }. Code
 * steps are executed by the caller (the server's sandbox), which then calls
 * advance() with the result exactly as an agent would. A Loop is one step:
 * the agent repeats the instruction itself and reports once.
 */
import type { Skill, SkillNode } from './model.js';
import { NODE_META, asText, outputHandles } from './nodeTypes.js';
import { mapRefs } from './refs.js';

export type StepStatus = 'ok' | 'fail';

export interface StepEvent {
  status: StepStatus;
  /** What the step produced (free text, or JSON for code). */
  output?: unknown;
  /** Which branch to take: 'yes' | 'no' | a switch case label | 'default'. */
  choose?: string;
  /** Optional message, e.g. why it failed. */
  message?: string;
}

export interface StepRecord {
  nodeId: number;
  name: string;
  type: SkillNode['type'];
  status: StepStatus;
  handle: string | null;
  output: unknown;
  message: string;
  startedAt: number;
  finishedAt: number;
}

export interface RunState {
  skillName: string;
  status: 'running' | 'done' | 'failed';
  input: unknown;
  current: number | null;
  currentStartedAt: number;
  /** Nodes waiting to be visited after the current one (when one arrow fans out). */
  queue: number[];
  outputs: Record<string, unknown>;
  steps: StepRecord[];
  result: unknown;
  error: string;
}

export interface StepView {
  nodeId: number;
  type: SkillNode['type'];
  name: string;
  /** Instruction with references filled in. */
  instruction: string;
  config: Record<string, string | string[]>;
  stages: { id: string; name: string; body: string }[];
  /** Branches the agent may choose from (empty when there is nothing to choose). */
  choices: string[];
  hint: string;
  /** For code steps: what the caller must execute. */
  code?: { language: string; code: string; input: unknown };
  /** For skill steps: the sub-skill to run. */
  subSkill?: string;
}

export interface WalkResult {
  state: RunState;
  step: StepView | null;
}

export function startRun(skill: Skill, input: unknown, now = Date.now()): WalkResult {
  const start = skill.nodes.find((node) => node.type === 'start');
  if (!start) throw new Error('The skill has no Start node.');
  const state: RunState = {
    skillName: skill.name,
    status: 'running',
    input,
    current: start.id,
    currentStartedAt: now,
    queue: [],
    outputs: {},
    steps: [],
    result: null,
    error: '',
  };
  return advance(skill, state, { status: 'ok', output: input }, now);
}

export function advance(skill: Skill, previous: RunState, event: StepEvent, now = Date.now()): WalkResult {
  const state: RunState = JSON.parse(JSON.stringify(previous)) as RunState;
  if (state.status !== 'running' || state.current === null) return { state, step: null };
  const node = skill.nodes.find((candidate) => candidate.id === state.current);
  if (!node) return fail(state, `Node ${state.current} vanished from the skill.`);

  const handle = chooseHandle(node, event);
  recordStep(state, node, event, handle, now);

  if (node.type === 'error') return fail(state, event.message || substitute(node.body, state, skill) || `Stopped at "${node.name}".`);
  if (node.type === 'end') {
    state.result = event.output ?? substitute(node.body, state, skill) ?? lastOutput(state);
    return finish(state);
  }
  if (event.status === 'fail' && (handle === null || handle === 'next')) {
    // A plain step that failed does not continue; only a "fail" arrow (Code) can catch it.
    return fail(state, event.message || `Step "${node.name}" failed.`);
  }

  const targets = handle ? skill.edges.filter((edge) => edge.from === node.id && edge.handle === handle).map((edge) => edge.to) : [];
  state.queue = [...targets, ...state.queue];
  return moveToNext(skill, state, now);
}

function moveToNext(skill: Skill, state: RunState, now: number): WalkResult {
  const nextId = state.queue.shift();
  const node = nextId === undefined ? undefined : skill.nodes.find((candidate) => candidate.id === nextId);
  if (!node) {
    state.result ??= lastOutput(state);
    return finish(state);
  }
  state.current = node.id;
  state.currentStartedAt = now;
  return { state, step: viewStep(skill, node, state) };
}

function chooseHandle(node: SkillNode, event: StepEvent): string | null {
  const handles = outputHandles(node).map((handle) => handle.id);
  if (handles.length === 0) return null;
  const choice = event.choose?.trim();
  if (choice) {
    const lower = choice.toLowerCase();
    const match = handles.find((handle) => handle.toLowerCase() === lower || handle.toLowerCase() === `case:${lower}`);
    if (match) return match;
  }
  switch (node.type) {
    case 'if':
    case 'confirm':
      return event.status === 'ok' ? 'yes' : 'no';
    case 'switch':
      return 'default';
    case 'code':
    case 'command':
    case 'request':
      return event.status === 'ok' ? 'next' : 'fail';
    default:
      return handles[0] ?? null;
  }
}

function recordStep(state: RunState, node: SkillNode, event: StepEvent, handle: string | null, now: number): void {
  if (event.output !== undefined) state.outputs[String(node.id)] = event.output;
  state.steps.push({
    nodeId: node.id,
    name: node.name,
    type: node.type,
    status: event.status,
    handle,
    output: event.output ?? null,
    message: event.message ?? '',
    startedAt: state.currentStartedAt,
    finishedAt: now,
  });
}

// ------------------------------------------------------------- rendering

export function substitute(text: string, state: RunState, skill?: Skill): string {
  return mapRefs(text, (ref) => {
    if (ref.keyword === 'input') return stringify(pick(state.input, ref.key));
    if (ref.nodeId === null) return null;
    const value = state.outputs[String(ref.nodeId)];
    if (value === undefined) {
      const name = skill?.nodes.find((node) => node.id === ref.nodeId)?.name;
      return name ? `(result of step ${ref.nodeId} "${name}")` : null;
    }
    return stringify(pick(value, ref.key));
  });
}

function pick(value: unknown, key: string | null): unknown {
  if (!key || value === null || typeof value !== 'object') return value;
  return (value as Record<string, unknown>)[key];
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function viewStep(skill: Skill, node: SkillNode, state: RunState): StepView {
  const config: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(node.config)) {
    if (key === 'cases' || key === 'language' || key === 'shell') continue;
    config[key] = Array.isArray(value) ? value.map((item) => substitute(item, state, skill)) : substitute(value, state, skill);
  }
  const choices = node.type === 'if' || node.type === 'switch' || node.type === 'confirm' ? outputHandles(node).map((handle) => (handle.id.startsWith('case:') ? handle.id.slice(5) : handle.id)) : [];
  const view: StepView = {
    nodeId: node.id,
    type: node.type,
    name: substitute(node.name, state, skill),
    instruction: node.type === 'code' ? node.body : substitute(node.body, state, skill),
    config,
    stages: node.stages.map((stage) => ({ ...stage, body: substitute(stage.body, state, skill) })),
    choices,
    hint: hintFor(node),
  };
  if (node.type === 'code') {
    view.code = { language: asText(node.config['language']) || 'python', code: node.body, input: { input: state.input, steps: state.outputs } };
  }
  if (node.type === 'skill') view.subSkill = node.name.trim();
  return view;
}

function hintFor(node: SkillNode): string {
  switch (node.type) {
    case 'do':
      return 'Do this, then report ok (with what you produced as output) or fail.';
    case 'ask':
      return 'Ask the user this. Report their answer as output.';
    case 'confirm':
      return 'Show the user exactly what will happen and wait for their answer. Report choose: "yes" or "no". Never proceed on "yes" without their explicit reply.';
    case 'text':
      return 'Produce this text with the references filled in. Check its format and correctness before continuing, then report the final text as output.';
    case 'command':
      return 'Run this command in your terminal. Report ok with its output, or fail with the error.';
    case 'web':
      return 'Open the URL in the browser and do what the instruction says. Report what you found as output.';
    case 'file':
      return 'Do this to the file at the path shown. Report ok, with the contents if you read it.';
    case 'request':
      return 'Make this HTTP request. Report ok with the parts of the response the instruction asks for, or fail with the status and error.';
    case 'if':
      return 'Answer the question. Report choose: "yes" or "no".';
    case 'switch':
      return 'Pick the matching case. Report choose: <case> or "default".';
    case 'loop':
      return 'Repeat the instruction for every item, then report ok once with what you collected as output.';
    case 'code':
      return 'Executed in the sandbox automatically.';
    case 'skill':
      return 'Run the named skill, then report its result as output.';
    case 'error':
      return 'The skill stops here with this message.';
    case 'end':
      return 'The skill is complete. Report the final result as output.';
    default:
      return '';
  }
}

function lastOutput(state: RunState): unknown {
  for (let index = state.steps.length - 1; index >= 0; index -= 1) {
    const output = state.steps[index]!.output;
    if (output !== null && output !== undefined) return output;
  }
  return null;
}

function finish(state: RunState): WalkResult {
  state.status = 'done';
  state.current = null;
  state.queue = [];
  return { state, step: null };
}

function fail(state: RunState, message: string): WalkResult {
  state.status = 'failed';
  state.error = message;
  state.current = null;
  state.queue = [];
  return { state, step: null };
}

/** A compact, agent-readable rendering of a step. */
export function describeStep(step: StepView): string {
  const lines: string[] = [];
  lines.push(`Step ${step.nodeId} · ${NODE_META[step.type].keyword}: ${step.name}`);
  for (const [key, value] of Object.entries(step.config)) {
    const rendered = Array.isArray(value) ? value.join('; ') : value;
    if (rendered.trim()) lines.push(`${key}: ${rendered}`);
  }
  if (step.instruction.trim()) {
    lines.push('');
    lines.push(step.instruction.trim());
  }
  for (const stage of step.stages) {
    lines.push('');
    lines.push(`${stage.id} ${stage.name}`.trim());
    if (stage.body.trim()) lines.push(stage.body.trim());
  }
  if (step.choices.length) lines.push('', `Choices: ${step.choices.join(' | ')}`);
  lines.push('', step.hint);
  return lines.join('\n');
}
