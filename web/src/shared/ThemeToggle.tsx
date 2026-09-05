import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from './theme.js';

/** Header button cycling system → light → dark. */
export function ThemeToggle() {
  const { preference, resolved, cycle } = useTheme();
  const label = preference === 'system' ? `System (${resolved})` : preference === 'light' ? 'Light' : 'Dark';
  const Icon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <button className="btn icon" onClick={cycle} title={`Theme: ${label}. Click to change.`} aria-label={`Theme: ${label}`}>
      <Icon size={15} />
    </button>
  );
}
