import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronUp, XCircle } from 'lucide-react';
import { useSkillStore } from '../store/skillStore.js';
import { useWorkspaceStore } from '../store/workspaceStore.js';

/** Bottom status bar: save state and validation problems; click a problem to open the node. */
export function ProblemsBar() {
  const problems = useSkillStore((state) => state.problems);
  const dirty = useSkillStore((state) => state.dirty);
  const saving = useSkillStore((state) => state.saving);
  const skill = useSkillStore((state) => state.skill);
  const setEditing = useSkillStore((state) => state.setEditing);
  const storage = useWorkspaceStore((state) => state.info);
  const [open, setOpen] = useState(false);
  if (!skill) return null;
  const errors = problems.filter((problem) => problem.severity === 'error').length;
  const warnings = problems.length - errors;
  return (
    <div>
      {open && problems.length > 0 && (
        <ul className="scroll px-3 py-2 space-y-1" style={{ maxHeight: 180 }}>
          {problems.map((problem, index) => (
            <li key={index}>
              <button className="flex items-start gap-2 text-left text-[12px]" onClick={() => problem.nodeId !== undefined && setEditing(problem.nodeId)}>
                {problem.severity === 'error' ? <XCircle size={13} style={{ color: 'var(--danger)', marginTop: 1 }} /> : <AlertTriangle size={13} style={{ color: 'var(--warn)', marginTop: 1 }} />}
                <span>
                  {problem.nodeId !== undefined && (
                    <span className="font-mono mr-1" style={{ color: 'var(--muted)' }}>
                      {problem.nodeId}
                    </span>
                  )}
                  {problem.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="statusbar">
        <button className="flex items-center gap-1" onClick={() => setOpen((value) => !value)} disabled={problems.length === 0}>
          {problems.length === 0 ? <CheckCircle2 size={13} style={{ color: 'var(--ok)' }} /> : <ChevronUp size={13} style={{ transform: open ? 'rotate(180deg)' : undefined }} />}
          {errors > 0 && <span style={{ color: 'var(--danger)' }}>{errors} error{errors === 1 ? '' : 's'}</span>}
          {warnings > 0 && <span style={{ color: 'var(--warn)' }}>{warnings} warning{warnings === 1 ? '' : 's'}</span>}
          {problems.length === 0 && <span>Ready to export</span>}
        </button>
        <span className="flex-1" />
        <span>
          {skill.nodes.length} nodes · {skill.edges.length} arrows
        </span>
        <span>{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}</span>
        {storage && (
          <span title={storage.location} className="storage-chip">
            {storage.label}
          </span>
        )}
      </div>
    </div>
  );
}
