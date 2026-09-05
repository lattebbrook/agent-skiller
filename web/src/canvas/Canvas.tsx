/**
 * The canvas: React Flow wired to the skill store. Owns drag/drop from the
 * palette, the node picker, connection rules, keyboard tools and the zoom pill.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type OnConnectEnd,
} from '@xyflow/react';
import { autoLayout, type Edge as SkillEdge, type Skill } from '@agent-skiller/core';
import { copyItems, pasteItems } from '../store/skillOps.js';
import { Copy, ClipboardPaste, Hand, LayoutGrid, Map as MapIcon, Maximize, Minus, MousePointer2, Pencil, Plus, Spline, SquarePlus, StickyNote, Trash2, WandSparkles, Waypoints } from 'lucide-react';
import { PALETTE, type PaletteEntry, type Position } from '@agent-skiller/core';
import { useSkillStore } from '../store/skillStore.js';
import { parseEdgeId } from '../store/skillOps.js';
import { hasTextSelection, useShortcuts } from '../shared/useShortcuts.js';
import { useToast } from '../shared/Toast.js';
import { DRAG_MIME } from '../palette/Palette.js';
import { toFlowEdges, toFlowNodes, type NoteFlowNode, type SkillFlowNode } from './flowMapping.js';
import { SkillNodeView } from './SkillNodeView.js';
import { NoteNodeView } from './NoteNodeView.js';
import { SkillEdgeView } from './SkillEdgeView.js';
import { NodePicker, type PickerChoice } from './NodePicker.js';
import { ContextMenu, type MenuItem } from './ContextMenu.js';
import { GenerateDialog } from '../views/GenerateDialog.js';
import { useCanvasPrefs } from './prefs.js';

const nodeTypes = { skill: SkillNodeView, note: NoteNodeView };
const edgeTypes = { skill: SkillEdgeView };

interface PickerState {
  screen: { x: number; y: number };
  flow: Position;
  pending: { from: number; handle: string } | null;
}

export interface CanvasApi {
  addAtCenter: (entry: PaletteEntry) => void;
  addNoteAtCenter: () => void;
  openPicker: () => void;
}

export function Canvas({ apiRef, onSave, onExport }: { apiRef: React.MutableRefObject<CanvasApi | null>; onSave: () => void; onExport: () => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner apiRef={apiRef} onSave={onSave} onExport={onExport} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ apiRef, onSave, onExport }: { apiRef: React.MutableRefObject<CanvasApi | null>; onSave: () => void; onExport: () => void }) {
  const flow = useReactFlow();
  const toast = useToast();
  const skill = useSkillStore((state) => state.skill);
  const problems = useSkillStore((state) => state.problems);
  const selected = useSkillStore((state) => state.selected);
  const panMode = useSkillStore((state) => state.panMode);
  const store = useSkillStore;

  const wrapper = useRef<HTMLDivElement>(null);
  const mouse = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragOverrides, setDragOverrides] = useState<Record<string, Position>>({});
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [menu, setMenu] = useState<{ screen: { x: number; y: number }; items: MenuItem[] } | null>(null);
  const [generateAt, setGenerateAt] = useState<Position | null>(null);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [prefs, setPrefs] = useCanvasPrefs();
  const [spacePan, setSpacePan] = useState(false);

  const nodes = useMemo(() => {
    if (!skill) return [];
    const mapped = toFlowNodes(skill, problems, selected);
    if (Object.keys(dragOverrides).length === 0) return mapped;
    return mapped.map((node) => (dragOverrides[node.id] ? { ...node, position: dragOverrides[node.id]! } : node));
  }, [skill, problems, selected, dragOverrides]);
  const edges = useMemo(() => (skill ? toFlowEdges(skill).map((edge) => ({ ...edge, selected: selectedEdges.includes(edge.id) })) : []), [skill, selectedEdges]);

  // ---------------------------------------------------------- node changes
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const state = store.getState();
      let nextSelected: string[] | null = null;
      const overrides: Record<string, Position> = {};
      let anyDrag = false;
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          if (change.dragging) {
            overrides[change.id] = change.position;
            anyDrag = true;
          }
        } else if (change.type === 'select') {
          const current: string[] = nextSelected ?? [...state.selected];
          nextSelected = change.selected ? [...new Set([...current, change.id])] : current.filter((id: string) => id !== change.id);
        }
      }
      if (anyDrag) setDragOverrides((current) => ({ ...current, ...overrides }));
      if (nextSelected) state.select(nextSelected);
    },
    [store],
  );

  const onNodeDragStart = useCallback(() => store.getState().snapshot(), [store]);
  const onNodeDragStop = useCallback(
    (_event: unknown, _node: SkillFlowNode | NoteFlowNode, draggedNodes: (SkillFlowNode | NoteFlowNode)[]) => {
      const positions: Record<string, Position> = {};
      for (const node of draggedNodes) positions[node.id] = node.position;
      store.getState().moveItems(positions, { history: false });
      setDragOverrides({});
    },
    [store],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setSelectedEdges((current) => {
      let next = current;
      for (const change of changes) {
        if (change.type === 'select') next = change.selected ? [...new Set([...next, change.id])] : next.filter((id) => id !== change.id);
      }
      return next;
    });
  }, []);

  // ------------------------------------------------------------ connecting
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle) return;
      const result = store.getState().connect(Number(connection.source), connection.sourceHandle, Number(connection.target));
      if (!result.ok && result.reason) toast.show(result.reason, 'error');
    },
    [store, toast],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState: FinalConnectionState) => {
      if (connectionState.isValid || !connectionState.fromNode || !connectionState.fromHandle?.id) return;
      if (connectionState.fromHandle.type !== 'source') return;
      const point = 'changedTouches' in event ? event.changedTouches[0]! : (event as MouseEvent);
      setPicker({
        screen: { x: point.clientX, y: point.clientY },
        flow: flow.screenToFlowPosition({ x: point.clientX, y: point.clientY }),
        pending: { from: Number(connectionState.fromNode.id), handle: connectionState.fromHandle.id },
      });
    },
    [flow],
  );

  // ------------------------------------------------------------- adding
  const centerFlow = useCallback((): Position => {
    const rect = wrapper.current?.getBoundingClientRect();
    const screen = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const position = flow.screenToFlowPosition(screen);
    return { x: position.x - 100, y: position.y - 30 };
  }, [flow]);

  const placeEntry = useCallback(
    (entry: PaletteEntry, position: Position, pending: PickerState['pending'] = null) => {
      const state = store.getState();
      if (entry.type === 'start' && state.skill?.nodes.some((node) => node.type === 'start')) {
        toast.show('A skill has exactly one Start.', 'error');
        return;
      }
      const id = state.addNode(entry.type, position);
      if (pending) {
        const result = store.getState().connect(pending.from, pending.handle, id);
        if (!result.ok && result.reason) toast.show(result.reason, 'error');
      }
    },
    [store, toast],
  );

  const handlePick = useCallback(
    (choice: PickerChoice) => {
      if (!picker) return;
      if (choice.kind === 'note') store.getState().addNote(picker.flow, picker.pending?.from ?? null);
      else placeEntry(choice.entry, picker.flow, picker.pending);
      setPicker(null);
    },
    [picker, placeEntry, store],
  );

  const openPickerAt = useCallback(
    (screen: { x: number; y: number }) => {
      setPicker({ screen, flow: flow.screenToFlowPosition(screen), pending: null });
    },
    [flow],
  );

  useEffect(() => {
    apiRef.current = {
      addAtCenter: (entry) => placeEntry(entry, centerFlow()),
      addNoteAtCenter: () => store.getState().addNote(centerFlow()),
      openPicker: () => {
        const rect = wrapper.current?.getBoundingClientRect();
        openPickerAt(rect ? { x: rect.left + rect.width / 2 - 140, y: rect.top + 80 } : { x: 300, y: 120 });
      },
    };
  }, [apiRef, placeEntry, centerFlow, openPickerAt, store]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      const id = event.dataTransfer.getData(DRAG_MIME);
      if (!id) return;
      event.preventDefault();
      const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      if (id === 'note') {
        store.getState().addNote({ x: position.x - 90, y: position.y - 40 });
        return;
      }
      const entry = PALETTE.find((candidate) => candidate.id === id);
      if (entry) placeEntry(entry, { x: position.x - 100, y: position.y - 30 });
    },
    [flow, placeEntry, store],
  );

  // --------------------------------------------------------- context menu
  const openMenuAt = useCallback(
    (event: React.MouseEvent | MouseEvent, items: MenuItem[]) => {
      event.preventDefault();
      event.stopPropagation();
      setPicker(null);
      setMenu({ screen: { x: event.clientX, y: event.clientY }, items });
    },
    [],
  );

  const paneMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      const screen = { x: event.clientX, y: event.clientY };
      const at = flow.screenToFlowPosition(screen);
      openMenuAt(event, [
        { id: 'generate', label: 'Generate with AI…', icon: <WandSparkles size={14} />, className: 'wand', run: () => setGenerateAt(at) },
        { id: 'add', label: 'Add node here', icon: <SquarePlus size={14} />, hint: 'Tab', run: () => setPicker({ screen, flow: at, pending: null }) },
        { id: 'note', label: 'Add note here', icon: <StickyNote size={14} />, hint: 'N', run: () => store.getState().addNote({ x: at.x - 88, y: at.y - 32 }) },
        { id: 'paste', label: 'Paste', icon: <ClipboardPaste size={14} />, hint: '⌘V', disabled: !store.getState().clipboard, run: () => store.getState().paste(at) },
        { id: 'selectAll', label: 'Select all', hint: '⌘A', run: () => store.getState().selectAll() },
        { id: 'layout', label: 'Auto-layout', icon: <LayoutGrid size={14} />, hint: '⌘L', run: () => { store.getState().applyAutoLayout(); window.setTimeout(() => flow.fitView({ padding: 0.2 }), 30); } },
        { id: 'fit', label: 'Fit view', icon: <Maximize size={14} />, hint: 'F', run: () => flow.fitView({ padding: 0.2 }) },
      ]);
    },
    [flow, openMenuAt, store],
  );

  const nodeMenu = useCallback(
    (event: React.MouseEvent, node: SkillFlowNode | NoteFlowNode) => {
      const state = store.getState();
      // Right-clicking outside the selection acts on that item alone.
      if (!state.selected.includes(node.id)) state.select([node.id]);
      const isNote = node.type === 'note';
      const isStart = !isNote && (node as SkillFlowNode).data.type === 'start';
      openMenuAt(event, [
        ...(isNote
          ? []
          : [{ id: 'edit', label: 'Edit', icon: <Pencil size={14} />, hint: 'Enter', run: () => store.getState().setEditing(Number(node.id)) }]),
        { id: 'duplicate', label: 'Duplicate', icon: <Copy size={14} />, hint: '⌘D', disabled: isStart, run: () => store.getState().duplicateSelection() },
        { id: 'copy', label: 'Copy', hint: '⌘C', disabled: isStart, run: () => store.getState().copySelection() },
        { id: 'delete', label: 'Delete', icon: <Trash2 size={14} />, hint: '⌫', danger: true, disabled: isStart, run: () => store.getState().removeSelection() },
      ]);
    },
    [openMenuAt, store],
  );

  const edgeMenu = useCallback(
    (event: React.MouseEvent, edge: { data?: unknown }) => {
      const target = (edge.data as { edge?: SkillEdge } | undefined)?.edge;
      if (!target) return;
      openMenuAt(event, [{ id: 'delete', label: 'Delete arrow', icon: <Trash2 size={14} />, hint: '⌫', danger: true, run: () => store.getState().disconnect(target) }]);
    },
    [openMenuAt, store],
  );

  /**
   * Drops a generated skill onto the canvas. "steps" pastes its nodes (minus
   * its own Start) beside the click point with fresh ids, so nothing already
   * on the canvas is disturbed; "skill" replaces the document outright.
   */
  const insertGenerated = useCallback(
    (generated: Skill, mode: 'skill' | 'steps') => {
      const state = store.getState();
      if (mode === 'skill' || !state.skill) {
        state.replaceSkill(generated);
        window.setTimeout(() => flow.fitView({ padding: 0.2 }), 40);
        return;
      }
      const laid = { ...generated, layout: Object.keys(generated.layout).length ? generated.layout : autoLayout(generated) };
      const ids = [...laid.nodes.filter((node) => node.type !== 'start').map((node) => String(node.id)), ...laid.notes.map((note) => note.id)];
      const clip = copyItems(laid, ids);
      const target = generateAt ?? centerFlow();
      const pasted = pasteItems(state.skill, clip, target);
      state.commit(pasted.skill);
      state.select(pasted.ids);
      window.setTimeout(() => flow.fitView({ padding: 0.2 }), 40);
    },
    [store, flow, generateAt, centerFlow],
  );

  // ------------------------------------------------------------ shortcuts
  const deleteSelection = useCallback(() => {
    const state = store.getState();
    if (state.selected.length) state.removeSelection();
    for (const edgeIdValue of selectedEdges) {
      const edge = parseEdgeId(edgeIdValue);
      if (edge) store.getState().disconnect(edge);
    }
    setSelectedEdges([]);
  }, [store, selectedEdges]);

  useShortcuts([
    { combo: 's', run: () => store.getState().setPanMode(false) },
    { combo: 'h', run: () => store.getState().setPanMode(true) },
    { combo: 'v', run: () => store.getState().setPanMode(false) },
    { combo: 'tab', run: () => apiRef.current?.openPicker(), when: () => !picker },
    { combo: 'n', run: () => store.getState().addNote(flow.screenToFlowPosition(mouse.current)) },
    { combo: 'enter', run: () => {
        const state = store.getState();
        const first = state.selected.find((id) => /^\d+$/.test(id));
        if (first) state.setEditing(Number(first));
      }, when: () => store.getState().editingId === null },
    { combo: 'backspace|delete', run: deleteSelection },
    { combo: 'mod+z', run: () => store.getState().undo(), allowInEditable: false },
    { combo: 'mod+shift+z', run: () => store.getState().redo() },
    { combo: 'mod+c', run: () => store.getState().copySelection(), when: () => !hasTextSelection() },
    { combo: 'mod+v', run: () => store.getState().paste(flow.screenToFlowPosition(mouse.current)) },
    { combo: 'mod+d', run: () => store.getState().duplicateSelection() },
    { combo: 'mod+a', run: () => store.getState().selectAll() },
    { combo: 'mod+s', run: onSave, allowInEditable: true },
    { combo: 'mod+e', run: onExport },
    { combo: 'mod+l', run: () => { store.getState().applyAutoLayout(); window.setTimeout(() => flow.fitView({ padding: 0.2 }), 30); } },
    { combo: 'f', run: () => flow.fitView({ padding: 0.2 }) },
    { combo: '1', run: () => flow.zoomTo(1) },
    { combo: 'escape', run: () => { setMenu(null); setPicker(null); store.getState().setEditing(null); store.getState().select([]); setSelectedEdges([]); }, allowInEditable: true },
  ]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !event.repeat && !(event.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]')) setSpacePan(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // A different file needs a fresh fit; React Flow only fits on mount.
  const path = useSkillStore((state) => state.path);
  useEffect(() => {
    const timer = window.setTimeout(() => flow.fitView({ padding: 0.2 }), 30);
    return () => window.clearTimeout(timer);
  }, [path, flow]);

  const pan = panMode || spacePan;

  if (!skill) return null;

  return (
    <div
      ref={wrapper}
      className="relative h-full w-full"
      onMouseMove={(event) => {
        mouse.current = { x: event.clientX, y: event.clientY };
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(DRAG_MIME)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={(_event, node) => {
          if (node.type === 'skill') store.getState().setEditing(Number(node.id));
        }}
        onPaneClick={() => {
          store.getState().select([]);
          store.getState().setEditing(null);
          setSelectedEdges([]);
        }}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).classList.contains('react-flow__pane')) openPickerAt({ x: event.clientX, y: event.clientY });
        }}
        onPaneContextMenu={paneMenu}
        onNodeContextMenu={nodeMenu}
        onEdgeContextMenu={edgeMenu}
        /* Right button is reserved for the context menu, so panning is middle-drag, Space, or the hand tool. */
        panOnDrag={pan ? true : [1]}
        selectionOnDrag={!pan}
        panOnScroll
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode="Shift"
        snapToGrid
        snapGrid={[16, 16]}
        minZoom={0.2}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        className={pan ? 'pan-mode' : ''}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--canvas-dot)" />
        {showMiniMap && <MiniMap pannable zoomable nodeColor={() => 'var(--line-strong)'} />}
      </ReactFlow>

      <div className="zoom-pill">
        <button className={`btn icon ${!pan ? 'active' : ''}`} title="Select (S)" onClick={() => store.getState().setPanMode(false)}>
          <MousePointer2 size={15} />
        </button>
        <button className={`btn icon ${pan ? 'active' : ''}`} title="Hand / pan (H, hold Space)" onClick={() => store.getState().setPanMode(true)}>
          <Hand size={15} />
        </button>
        <span className="divider" />
        <button className="btn icon" title="Zoom out" onClick={() => flow.zoomOut()}>
          <Minus size={15} />
        </button>
        <button className="btn icon" title="Zoom in" onClick={() => flow.zoomIn()}>
          <Plus size={15} />
        </button>
        <button className="btn icon" title="Fit view (F)" onClick={() => flow.fitView({ padding: 0.2 })}>
          <Maximize size={15} />
        </button>
        <span className="divider" />
        <button className="btn icon" title="Auto-layout (⌘L)" onClick={() => { store.getState().applyAutoLayout(); window.setTimeout(() => flow.fitView({ padding: 0.2 }), 30); }}>
          <LayoutGrid size={15} />
        </button>
        <button
          className="btn icon"
          title={prefs.edgeStyle === 'curved' ? 'Arrows: curved. Click for right angles.' : 'Arrows: right angles. Click for curves.'}
          onClick={() => setPrefs({ edgeStyle: prefs.edgeStyle === 'curved' ? 'orthogonal' : 'curved' })}
        >
          {prefs.edgeStyle === 'curved' ? <Spline size={15} /> : <Waypoints size={15} />}
        </button>
        <button className={`btn icon ${showMiniMap ? 'active' : ''}`} title="Minimap" onClick={() => setShowMiniMap((value) => !value)}>
          <MapIcon size={15} />
        </button>
      </div>

      {generateAt && <GenerateDialog onClose={() => setGenerateAt(null)} onInsert={insertGenerated} />}

      {menu && <ContextMenu at={menu.screen} items={menu.items} onClose={() => setMenu(null)} />}

      {picker && <NodePicker at={picker.screen} includeStart={!skill.nodes.some((node) => node.type === 'start')} onPick={handlePick} onClose={() => setPicker(null)} />}
    </div>
  );
}
