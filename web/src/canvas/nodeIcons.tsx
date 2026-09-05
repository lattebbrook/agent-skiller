/**
 * The logo for each node kind. Lives in the web package, not in core, so the
 * format stays free of any UI dependency. One icon per kind, used on the
 * canvas, in the palette, in the picker and in the drawer.
 */
import {
  AlertTriangle,
  Blocks,
  Code2,
  FileText,
  Flag,
  FolderOpen,
  Globe,
  MessageCircleQuestion,
  MousePointerClick,
  Repeat,
  Route,
  ShieldCheck,
  Split,
  StickyNote,
  Terminal,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { NodeType } from '@agent-skiller/core';

export const NODE_ICON: Record<NodeType, LucideIcon> = {
  start: Zap,
  do: MousePointerClick,
  ask: MessageCircleQuestion,
  confirm: ShieldCheck,
  text: FileText,
  if: Split,
  switch: Route,
  loop: Repeat,
  command: Terminal,
  code: Code2,
  web: Globe,
  file: FolderOpen,
  request: Webhook,
  skill: Blocks,
  error: AlertTriangle,
  end: Flag,
};

export const NOTE_ICON = StickyNote;

/** The coloured, rounded logo tile. `size` is the tile; the glyph scales with it. */
export function NodeIcon({ type, size = 26, color }: { type: NodeType; size?: number; color: string }) {
  const Icon = NODE_ICON[type];
  return (
    <span className="node-icon" style={{ ['--icon-color' as string]: color, width: size, height: size, borderRadius: Math.round(size * 0.29) }}>
      <Icon size={Math.round(size * 0.58)} strokeWidth={2} />
    </span>
  );
}
