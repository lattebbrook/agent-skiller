import { memo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, useStore, type EdgeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import type { Edge } from '@agent-skiller/core';
import { useSkillStore } from '../store/skillStore.js';
import { useCanvasPrefs } from './prefs.js';

/**
 * An arrow. The visible line is thin, but a transparent 26px-wide path on top
 * of it takes the pointer, so the arrow is easy to hit. Hovering it (or its
 * label) reveals the delete button.
 *
 * The button cannot be revealed with CSS alone: EdgeLabelRenderer portals it
 * out of the edge's own DOM subtree, so `.react-flow__edge:hover` never
 * matches it. Hence the explicit hover state.
 *
 * The label renderer lives inside the zoomed viewport, so the tools are
 * counter-scaled: the button stays a comfortable target when zoomed out.
 */
export const SkillEdgeView = memo(function SkillEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd, data, selected }: EdgeProps) {
  const disconnect = useSkillStore((state) => state.disconnect);
  const [hovered, setHovered] = useState(false);
  const zoom = useStore((state) => state.transform[2]);
  const scale = Math.min(2, Math.max(0.8, 1 / zoom));
  const [prefs] = useCanvasPrefs();
  const geometry = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] = prefs.edgeStyle === 'orthogonal' ? getSmoothStepPath({ ...geometry, borderRadius: 8 }) : getBezierPath(geometry);
  const edge = (data as { edge?: Edge } | undefined)?.edge;
  const active = hovered || selected === true;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={0} style={active ? { stroke: 'var(--accent)', strokeWidth: 2.4 } : undefined} />
      <path
        d={path}
        fill="none"
        strokeOpacity={0}
        strokeWidth={Math.max(26, 26 / zoom)}
        className="react-flow__edge-interaction"
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-tools nodrag nopan${active ? ' active' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(${scale})` }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {label ? <span className="edge-label">{String(label)}</span> : null}
          {edge && (
            <button className="edge-delete" title="Remove arrow" aria-label="Remove arrow" onClick={() => disconnect(edge)}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
