/**
 * CodeMirror 6 wrapper. Markdown for instructions, Python/JS for code.
 * `${2}` references render as chips carrying the node name; unknown ones are underlined.
 * Dropped text (a chip from the node list) is inserted at the drop point by CodeMirror itself.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { Decoration, EditorView, MatchDecorator, ViewPlugin, keymap, lineNumbers, placeholder as placeholderExt, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { parseRef } from '@agent-skiller/core';

export interface CodeEditorHandle {
  insert: (text: string) => void;
  focus: () => void;
}

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: 'markdown' | 'python' | 'javascript' | 'plain';
  placeholder?: string;
  refNames: Record<number, string>;
  minHeight?: number;
  maxHeight?: number;
  autoFocus?: boolean;
}

/**
 * Marks references. Nothing is added to the text flow — no pseudo-content —
 * because CodeMirror measures cursor positions from the real characters, and
 * anything extra in the line would push the caret off the text.
 */
function refDecorator(refNames: Record<number, string>) {
  const matcher = new MatchDecorator({
    regexp: /\$\{([^}]+)\}/g,
    decoration: (match) => {
      const ref = parseRef(match[1]!);
      if (ref.keyword) return Decoration.mark({ class: 'cm-ref', attributes: { title: 'What the caller passed to Start' } });
      const name = ref.nodeId === null ? undefined : refNames[ref.nodeId];
      if (!name) return Decoration.mark({ class: 'cm-ref unknown', attributes: { title: 'No node with this id' } });
      return Decoration.mark({ class: 'cm-ref', attributes: { title: `Result of step ${ref.nodeId}: ${name}` } });
    },
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

function languageExtension(language: CodeEditorProps['language']) {
  switch (language) {
    case 'python':
      return python();
    case 'javascript':
      return javascript();
    case 'markdown':
      return markdown();
    default:
      return [];
  }
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({ value, onChange, language, placeholder, refNames, minHeight = 120, maxHeight = 480, autoFocus }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const languageCompartment = useRef(new Compartment());
  const refCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useImperativeHandle(ref, () => ({
    insert: (text) => {
      const editor = view.current;
      if (!editor) return;
      const { from, to } = editor.state.selection.main;
      editor.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
      editor.focus();
    },
    focus: () => view.current?.focus(),
  }));

  useEffect(() => {
    if (!host.current) return;
    const isCode = language === 'python' || language === 'javascript';
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        isCode ? lineNumbers() : [],
        EditorView.lineWrapping,
        placeholder ? placeholderExt(placeholder) : [],
        languageCompartment.current.of(languageExtension(language)),
        refCompartment.current.of(refDecorator(refNames)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.theme({
          '&': { minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', lineHeight: '1.55' },
          // The default theme paints a black caret, invisible on a dark page; use the text colour in both modes.
          '.cm-content': { caretColor: 'var(--text)', padding: '8px 0' },
          '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)', borderLeftWidth: '1.5px' },
          '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
            backgroundColor: 'var(--accent-soft)',
          },
          '.cm-activeLine': { backgroundColor: 'transparent' },
        }),
        EditorView.editorAttributes.of({ class: isCode ? '' : 'prose' }),
      ],
    });
    const editor = new EditorView({ state, parent: host.current });
    view.current = editor;
    if (autoFocus) editor.focus();
    return () => {
      editor.destroy();
      view.current = null;
    };
    // The editor is created once per language; value syncs below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current !== value) editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: refCompartment.current.reconfigure(refDecorator(refNames)) });
  }, [refNames]);

  return <div ref={host} onKeyDown={(event) => event.stopPropagation()} />;
});
