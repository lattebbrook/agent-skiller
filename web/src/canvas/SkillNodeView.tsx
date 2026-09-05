import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NODE_META } from '@agent-skiller/core';
import { NodeIcon } from './nodeIcons.js';
import type { SkillFlowNode } from './flowMapping.js';

export const SkillNodeView = memo(function SkillNodeView({ data, selected }: NodeProps<SkillFlowNode>) {
  const meta = NODE_META[data.type];
  const outputs = data.outputs;
  const className = ['skill-node', selected ? 'selected' : '', data.severity === 'error' ? 'has-error' : data.severity === 'warning' ? 'has-warning' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} title={[`${meta.keyword}: ${data.name}`, data.problemText].filter(Boolean).join('\n\n')} style={{ paddingRight: outputs.length > 1 ? 44 : 0, minHeight: outputs.length > 2 ? outputs.length * 20 + 10 : undefined, ['--node-color' as string]: data.color }}>
      {data.hasInput && <Handle type="target" position={Position.Left} id="in" />}
      <div className="head">
        <NodeIcon type={data.type} size={22} color={data.color} />
        <span className="idchip">{data.nodeId}</span>
        <span className="name">{data.name}</span>
      </div>
      {data.preview && <div className="body">{data.preview}</div>}
      {outputs.map((output, index) => {
        const top = outputs.length === 1 ? '50%' : `${((index + 1) / (outputs.length + 1)) * 100}%`;
        return (
          <div key={output.id}>
            <Handle type="source" position={Position.Right} id={output.id} style={{ top }} />
            {outputs.length > 1 && (
              <span className="out-label" style={{ top }}>
                {output.label}
              </span>
            )}
          </div>
        );
      })}
      {data.severity && <span className={`badge ${data.severity === 'warning' ? 'warn' : ''}`}>{data.severity === 'error' ? '!' : '?'}</span>}
    </div>
  );
});
