/**
 * The open skill, its history and selection. Every edit goes through
 * `commit`, which snapshots for undo and re-validates.
 */
import { create } from 'zustand';
import {
  autoLayout,
  cloneSkill,
  validateSkill,
  type ConfigValue,
  type Edge,
  type Note,
  type NodeType,
  type Position,
  type Problem,
  type Skill,
  type SkillNode,
} from '@agent-skiller/core';
import * as ops from './skillOps.js';

const HISTORY_LIMIT = 100;

export interface SkillStore {
  path: string | null;
  skill: Skill | null;
  mtime: number;
  dirty: boolean;
  saving: boolean;
  diskChanged: boolean;
  problems: Problem[];
  selected: string[];
  editingId: number | null;
  panMode: boolean;
  past: Skill[];
  future: Skill[];
  clipboard: ops.Clip | null;

  load: (path: string, skill: Skill, mtime: number) => void;
  close: () => void;
  markSaved: (mtime: number) => void;
  setSaving: (saving: boolean) => void;
  setDiskChanged: (changed: boolean) => void;
  commit: (next: Skill, options?: { history?: boolean }) => void;
  snapshot: () => void;
  replaceSkill: (skill: Skill) => void;
  setMeta: (patch: Partial<Pick<Skill, 'name' | 'description' | 'tags' | 'title' | 'purpose' | 'version'>>) => void;

  addNode: (type: NodeType, position: Position, preset?: { config?: Record<string, ConfigValue>; name?: string }) => number;
  updateNode: (id: number, patch: Partial<Omit<SkillNode, 'id'>>) => void;
  connect: (from: number, handle: string, to: number) => { ok: boolean; reason?: string };
  disconnect: (edge: Edge) => void;
  removeItems: (ids: string[]) => void;
  moveItems: (positions: Record<string, Position>, options?: { history?: boolean }) => void;
  addNote: (position: Position, attachedTo?: number | null) => string;
  updateNote: (id: string, patch: Partial<Omit<Note, 'id'>>) => void;
  applyAutoLayout: () => void;

  select: (ids: string[]) => void;
  setEditing: (id: number | null) => void;
  setPanMode: (pan: boolean) => void;
  copySelection: () => void;
  paste: (at?: Position) => void;
  duplicateSelection: () => void;
  removeSelection: () => void;
  selectAll: () => void;
  undo: () => void;
  redo: () => void;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  path: null,
  skill: null,
  mtime: 0,
  dirty: false,
  saving: false,
  diskChanged: false,
  problems: [],
  selected: [],
  editingId: null,
  panMode: false,
  past: [],
  future: [],
  clipboard: null,

  load: (path, skill, mtime) => set({ path, skill, mtime, dirty: false, diskChanged: false, problems: validateSkill(skill), selected: [], editingId: null, past: [], future: [] }),
  close: () => set({ path: null, skill: null, mtime: 0, dirty: false, diskChanged: false, problems: [], selected: [], editingId: null, past: [], future: [] }),
  markSaved: (mtime) => set({ dirty: false, mtime, saving: false }),
  setSaving: (saving) => set({ saving }),
  setDiskChanged: (diskChanged) => set({ diskChanged }),

  commit: (next, options = {}) => {
    const { skill, past } = get();
    if (!skill) return;
    const history = options.history !== false;
    set({
      skill: next,
      dirty: true,
      problems: validateSkill(next),
      past: history ? [...past.slice(-HISTORY_LIMIT + 1), skill] : past,
      future: history ? [] : get().future,
    });
  },
  snapshot: () => {
    const { skill, past } = get();
    if (!skill) return;
    set({ past: [...past.slice(-HISTORY_LIMIT + 1), cloneSkill(skill)], future: [] });
  },
  replaceSkill: (skill) => {
    const current = get().skill;
    if (!current) return;
    get().commit({ ...skill, layout: Object.keys(skill.layout).length ? skill.layout : autoLayout(skill) });
    set({ selected: [], editingId: null });
  },
  setMeta: (patch) => {
    const { skill } = get();
    if (!skill) return;
    get().commit({ ...skill, ...patch });
  },

  addNode: (type, position, preset) => {
    const { skill } = get();
    if (!skill) return 0;
    const result = ops.addNode(skill, type, position, preset);
    get().commit(result.skill);
    set({ selected: [String(result.id)], editingId: result.id });
    return result.id;
  },
  updateNode: (id, patch) => {
    const { skill } = get();
    if (!skill) return;
    get().commit(ops.updateNode(skill, id, patch));
  },
  connect: (from, handle, to) => {
    const { skill } = get();
    if (!skill) return { ok: false, reason: 'No skill open.' };
    const result = ops.connect(skill, from, handle, to);
    if (result.ok) get().commit(result.skill);
    return result.reason ? { ok: result.ok, reason: result.reason } : { ok: result.ok };
  },
  disconnect: (edge) => {
    const { skill } = get();
    if (!skill) return;
    get().commit(ops.disconnect(skill, edge));
  },
  removeItems: (ids) => {
    const { skill, editingId, selected } = get();
    if (!skill || ids.length === 0) return;
    get().commit(ops.removeItems(skill, ids));
    set({
      selected: selected.filter((id) => !ids.includes(id)),
      editingId: editingId !== null && ids.includes(String(editingId)) ? null : editingId,
    });
  },
  moveItems: (positions, options) => {
    const { skill } = get();
    if (!skill) return;
    get().commit(ops.moveItems(skill, positions), options);
  },
  addNote: (position, attachedTo = null) => {
    const { skill } = get();
    if (!skill) return '';
    const result = ops.addNote(skill, position, attachedTo);
    get().commit(result.skill);
    set({ selected: [result.id] });
    return result.id;
  },
  updateNote: (id, patch) => {
    const { skill } = get();
    if (!skill) return;
    get().commit(ops.updateNote(skill, id, patch));
  },
  applyAutoLayout: () => {
    const { skill } = get();
    if (!skill) return;
    get().commit({ ...skill, layout: autoLayout(skill) });
  },

  select: (ids) => set({ selected: ids }),
  setEditing: (id) => set({ editingId: id, selected: id === null ? get().selected : [String(id)] }),
  setPanMode: (panMode) => set({ panMode }),
  copySelection: () => {
    const { skill, selected } = get();
    if (!skill || selected.length === 0) return;
    const clip = ops.copyItems(skill, selected);
    set({ clipboard: clip });
    void navigator.clipboard?.writeText(JSON.stringify({ agentSkillerClip: clip })).catch(() => undefined);
  },
  paste: (at) => {
    const { skill, clipboard } = get();
    if (!skill || !clipboard) return;
    const result = ops.pasteItems(skill, clipboard, at);
    get().commit(result.skill);
    set({ selected: result.ids });
  },
  duplicateSelection: () => {
    const { skill, selected } = get();
    if (!skill || selected.length === 0) return;
    const result = ops.pasteItems(skill, ops.copyItems(skill, selected));
    get().commit(result.skill);
    set({ selected: result.ids });
  },
  removeSelection: () => get().removeItems(get().selected),
  selectAll: () => {
    const { skill } = get();
    if (skill) set({ selected: ops.selectAllIds(skill) });
  },
  undo: () => {
    const { skill, past, future } = get();
    if (!skill || past.length === 0) return;
    const previous = past[past.length - 1]!;
    set({ skill: previous, past: past.slice(0, -1), future: [skill, ...future].slice(0, HISTORY_LIMIT), dirty: true, problems: validateSkill(previous) });
  },
  redo: () => {
    const { skill, past, future } = get();
    if (!skill || future.length === 0) return;
    const next = future[0]!;
    set({ skill: next, future: future.slice(1), past: [...past, skill].slice(-HISTORY_LIMIT), dirty: true, problems: validateSkill(next) });
  },
}));

export function problemsFor(problems: Problem[], nodeId: number): Problem[] {
  return problems.filter((problem) => problem.nodeId === nodeId);
}
