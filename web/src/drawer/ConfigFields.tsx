import { NODE_META, asList, asText, type ConfigValue, type SkillNode } from '@agent-skiller/core';
import { Lock, Plus, X } from 'lucide-react';

/**
 * The few settings a node can have. Only Start (when / input) and Code
 * (language) have any; Switch cases are edited as arrows in the drawer.
 */
export function ConfigFields({ node, onChange }: { node: SkillNode; onChange: (config: Record<string, ConfigValue>) => void }) {
  const fields = NODE_META[node.type].fields;
  if (fields.length === 0) return null;
  const set = (key: string, value: ConfigValue) => onChange({ ...node.config, [key]: value });
  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <div key={field.key}>
          <div className="label mb-1">
            {field.label}
            {field.help && (
              <span className="ml-1 normal-case tracking-normal font-normal" style={{ color: 'var(--muted)' }}>
                · {field.help}
              </span>
            )}
          </div>
          {field.locked ? (
            <div className="field locked flex items-center gap-2" title={field.help}>
              <Lock size={12} />
              <span className="truncate">{asText(node.config[field.key])}</span>
            </div>
          ) : field.key === 'shell' ? (
            <select className="field" value={asText(node.config['shell']) || 'sh'} onChange={(event) => set('shell', event.target.value)}>
              {['sh', 'bash', 'zsh', 'powershell', 'cmd'].map((shell) => (
                <option key={shell} value={shell}>
                  {shell}
                </option>
              ))}
            </select>
          ) : field.key === 'language' ? (
            <select className="field" value={asText(node.config['language']) || 'python'} onChange={(event) => set('language', event.target.value)}>
              <option value="python">python</option>
              <option value="javascript">javascript</option>
            </select>
          ) : field.kind === 'list' ? (
            <ListField values={asList(node.config[field.key])} placeholder={field.placeholder} onChange={(values) => set(field.key, values)} />
          ) : (
            <input className="field" value={asText(node.config[field.key])} placeholder={field.placeholder} onChange={(event) => set(field.key, event.target.value)} />
          )}
        </div>
      ))}
    </div>
  );
}

export function ListField({ values, placeholder, onChange, addLabel = 'Add' }: { values: string[]; placeholder?: string; onChange: (values: string[]) => void; addLabel?: string }) {
  return (
    <div className="space-y-1">
      {values.map((value, index) => (
        <div key={index} className="flex gap-1">
          <input
            className="field"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(values.map((item, position) => (position === index ? event.target.value : item)))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onChange([...values.slice(0, index + 1), '', ...values.slice(index + 1)]);
              }
            }}
          />
          <button className="btn icon" title="Remove" onClick={() => onChange(values.filter((_item, position) => position !== index))}>
            <X size={12} />
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => onChange([...values, ''])}>
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}
