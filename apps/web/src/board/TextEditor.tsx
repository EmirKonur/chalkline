import { FONT_SIZE } from '@chalkline/core';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type * as Y from 'yjs';
import { fontSizeOf } from '../geometry/bounds.ts';
import { worldToScreen } from '../geometry/camera.ts';
import {
  BOARD_FONT_WEIGHT,
  LINE_HEIGHT,
  STICKY_PADDING,
  layoutSticky,
  layoutText,
} from '../geometry/text.ts';
import { transformIndex, type TextDelta } from '../editor/caret.ts';
import type { Editor } from '../editor/editor.ts';
import { useStore } from '../lib/store.ts';
import { PALETTES } from '../theme/palette.ts';
import { useShapeVersion } from './useShapeVersion.ts';

/**
 * A textarea laid exactly over the shape being edited, sized and colored to
 * match the canvas text (which is hidden meanwhile). Every keystroke goes
 * straight into the shape's Y.Text, so collaborators see typing live, and
 * their edits flow back in with the caret kept in place.
 */
export function TextEditor({ editor }: { editor: Editor }) {
  const editing = useStore(editor.store, (s) => s.editing);
  const camera = useStore(editor.store, (s) => s.camera);
  const theme = useStore(editor.store, (s) => s.theme);
  const style = useStore(editor.store, (s) => s.style);
  const id = editing?.kind === 'shape' ? editing.id : null;
  useShapeVersion(editor, id);
  const shape = id ? editor.scene.get(id)?.shape : undefined;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(() => (shape && 'text' in shape ? shape.text : ''));
  const caret = useRef<[number, number] | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    if (!id) return;
    const text = editor.board.textOf(id);
    if (!text) return;
    const onChange = (event: Y.YTextEvent) => {
      const el = ref.current;
      const next = text.toJSON();
      if (!el || el.value === next) return;
      const delta = event.delta as TextDelta;
      caret.current = [
        transformIndex(el.selectionStart, delta),
        transformIndex(el.selectionEnd, delta),
      ];
      setValue(next);
    };
    text.observe(onChange);
    return () => text.unobserve(onChange);
  }, [editor, id]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && caret.current) {
      el.setSelectionRange(caret.current[0], caret.current[1]);
      caret.current = null;
    }
  }, [value]);

  if (!editing) return null;
  const palette = PALETTES[theme];
  const z = camera.zoom;
  let css: CSSProperties;
  let label = 'Text';

  if (shape?.kind === 'sticky') {
    const layout = layoutSticky(value, shape.w, shape.h, editor.measure);
    const origin = worldToScreen(camera, {
      x: shape.x + STICKY_PADDING,
      y: shape.y + STICKY_PADDING,
    });
    label = 'Sticky note text';
    css = {
      left: origin.x,
      top: origin.y,
      width: (shape.w - STICKY_PADDING * 2) * z,
      height: (shape.h - STICKY_PADDING * 2) * z,
      fontSize: layout.fontSize * z,
      color: palette.paperText,
      caretColor: palette.paperText,
    };
  } else {
    const at =
      shape ?? (editing.kind === 'draft' ? { x: editing.at.x, y: editing.at.y } : { x: 0, y: 0 });
    const fontSize = shape?.kind === 'text' ? fontSizeOf(shape) : FONT_SIZE[style.size];
    const layout = layoutText(value, fontSize, editor.measure);
    const origin = worldToScreen(camera, at);
    const color = palette.ink[shape?.ink ?? style.ink];
    css = {
      left: origin.x,
      top: origin.y,
      width: layout.width * z + fontSize * z,
      height: layout.height * z,
      fontSize: fontSize * z,
      color,
      caretColor: color,
      whiteSpace: 'pre',
    };
  }

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label={label}
      spellCheck
      value={value}
      style={{ ...css, fontWeight: BOARD_FONT_WEIGHT, lineHeight: LINE_HEIGHT }}
      onChange={(e) => {
        setValue(e.target.value);
        editor.updateEditingText(e.target.value);
      }}
      onBlur={() => editor.finishEditing()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          editor.finishEditing();
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          // Undo belongs to the board history, not the textarea's own stack.
          e.preventDefault();
          if (e.shiftKey) editor.redo();
          else editor.undo();
        }
        e.stopPropagation();
      }}
    />
  );
}
