import { INKS } from '@chalkline/core';
import type { Editor } from './editor.ts';
import type { ToolId } from './state.ts';

export type ShortcutGroup = 'Tools' | 'Edit' | 'Arrange' | 'View' | 'Board';

export interface ShortcutContext {
  editor: Editor;
  toggleCheatsheet: () => void;
  toggleTheme: () => void;
  exportPng: () => void;
}

export interface Shortcut {
  group: ShortcutGroup;
  label: string;
  /** Alternative key combinations, each a list of key names ("Mod" is Cmd or Ctrl). */
  keys: readonly (readonly string[])[];
  /** Absent for combinations the browser handles (clipboard) or that are gestures. */
  match?: (e: KeyboardEvent) => boolean;
  run?: (ctx: ShortcutContext) => void;
}

interface Combo {
  key?: string;
  code?: string;
  mod?: boolean;
  shift?: boolean;
}

function combo(spec: Combo): (e: KeyboardEvent) => boolean {
  return (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if ((spec.mod ?? false) !== mod || e.altKey) return false;
    if (spec.shift !== undefined && spec.shift !== e.shiftKey) return false;
    if (spec.code !== undefined) return e.code === spec.code;
    return e.key.toLowerCase() === spec.key;
  };
}

const any =
  (...matchers: ((e: KeyboardEvent) => boolean)[]) =>
  (e: KeyboardEvent) =>
    matchers.some((m) => m(e));

const TOOLS: [ToolId, string, string][] = [
  ['select', 'Select', 'v'],
  ['hand', 'Hand (pan)', 'h'],
  ['pen', 'Chalk pen', 'p'],
  ['eraser', 'Eraser', 'e'],
  ['rect', 'Rectangle', 'r'],
  ['ellipse', 'Ellipse', 'o'],
  ['line', 'Line', 'l'],
  ['arrow', 'Arrow', 'a'],
  ['text', 'Text', 't'],
  ['sticky', 'Sticky note', 's'],
];

export const TOOL_KEYS: Record<ToolId, string> = Object.fromEntries(
  TOOLS.map(([tool, , key]) => [tool, key.toUpperCase()]),
) as Record<ToolId, string>;

export const SHORTCUTS: readonly Shortcut[] = [
  ...TOOLS.map(([tool, label, key]): Shortcut => ({
    group: 'Tools',
    label,
    keys: [[key.toUpperCase()]],
    match: combo({ key, shift: false }),
    run: ({ editor }) => editor.setTool(tool),
  })),
  { group: 'Tools', label: 'Chalk colors', keys: [['1'], ['7']] },
  {
    group: 'Edit',
    label: 'Undo',
    keys: [['Mod', 'Z']],
    match: combo({ key: 'z', mod: true, shift: false }),
    run: ({ editor }) => editor.undo(),
  },
  {
    group: 'Edit',
    label: 'Redo',
    keys: [
      ['Mod', 'Shift', 'Z'],
      ['Mod', 'Y'],
    ],
    match: any(combo({ key: 'z', mod: true, shift: true }), combo({ key: 'y', mod: true })),
    run: ({ editor }) => editor.redo(),
  },
  { group: 'Edit', label: 'Copy', keys: [['Mod', 'C']] },
  { group: 'Edit', label: 'Cut', keys: [['Mod', 'X']] },
  { group: 'Edit', label: 'Paste', keys: [['Mod', 'V']] },
  {
    group: 'Edit',
    label: 'Duplicate',
    keys: [['Mod', 'D']],
    match: combo({ key: 'd', mod: true }),
    run: ({ editor }) => editor.duplicateSelection(),
  },
  {
    group: 'Edit',
    label: 'Delete',
    keys: [['Delete'], ['Backspace']],
    match: any(combo({ key: 'delete' }), combo({ key: 'backspace' })),
    run: ({ editor }) => editor.deleteSelection(),
  },
  {
    group: 'Edit',
    label: 'Select all',
    keys: [['Mod', 'A']],
    match: combo({ key: 'a', mod: true }),
    run: ({ editor }) => editor.selectAll(),
  },
  {
    group: 'Edit',
    label: 'Edit text or note',
    keys: [['Enter']],
    match: combo({ key: 'enter' }),
    run: ({ editor }) => {
      const [only] = editor.selectedShapes();
      if (only && editor.state.selection.size === 1) editor.startEditing(only.id);
    },
  },
  { group: 'Edit', label: 'Nudge (Shift for 10)', keys: [['Arrows']] },
  {
    group: 'Edit',
    label: 'Deselect or cancel',
    keys: [['Esc']],
    match: combo({ key: 'escape' }),
    run: ({ editor }) => editor.escape(),
  },
  {
    group: 'Arrange',
    label: 'Bring forward',
    keys: [[']']],
    match: combo({ code: 'BracketRight', shift: false }),
    run: ({ editor }) => editor.arrange('forward'),
  },
  {
    group: 'Arrange',
    label: 'Send backward',
    keys: [['[']],
    match: combo({ code: 'BracketLeft', shift: false }),
    run: ({ editor }) => editor.arrange('backward'),
  },
  {
    group: 'Arrange',
    label: 'Bring to front',
    keys: [['Shift', ']']],
    match: combo({ code: 'BracketRight', shift: true }),
    run: ({ editor }) => editor.arrange('front'),
  },
  {
    group: 'Arrange',
    label: 'Send to back',
    keys: [['Shift', '[']],
    match: combo({ code: 'BracketLeft', shift: true }),
    run: ({ editor }) => editor.arrange('back'),
  },
  { group: 'Arrange', label: 'Move a copy', keys: [['Alt', 'Drag']] },
  {
    group: 'View',
    label: 'Zoom in',
    keys: [['+'], ['Mod', '+']],
    match: (e) => !e.altKey && (e.key === '+' || e.key === '='),
    run: ({ editor }) => editor.zoomStep(1),
  },
  {
    group: 'View',
    label: 'Zoom out',
    keys: [['-'], ['Mod', '-']],
    match: (e) => !e.altKey && (e.key === '-' || e.key === '_'),
    run: ({ editor }) => editor.zoomStep(-1),
  },
  {
    group: 'View',
    label: 'Zoom to fit',
    keys: [['Shift', '1']],
    match: combo({ code: 'Digit1', shift: true }),
    run: ({ editor }) => editor.zoomToFit(),
  },
  {
    group: 'View',
    label: 'Zoom to 100%',
    keys: [['Shift', '0']],
    match: combo({ code: 'Digit0', shift: true }),
    run: ({ editor }) => editor.resetZoom(),
  },
  { group: 'View', label: 'Pan', keys: [['Space', 'Drag'], ['Scroll']] },
  { group: 'View', label: 'Zoom by scrolling', keys: [['Mod', 'Scroll'], ['Pinch']] },
  {
    group: 'View',
    label: 'Toggle dot grid',
    keys: [['G']],
    match: combo({ key: 'g', shift: false }),
    run: ({ editor }) => editor.toggleGrid(),
  },
  {
    group: 'View',
    label: 'Switch theme',
    keys: [['Shift', 'T']],
    match: combo({ key: 't', shift: true }),
    run: (ctx) => ctx.toggleTheme(),
  },
  {
    group: 'Board',
    label: 'Export as PNG',
    keys: [['Mod', 'Shift', 'E']],
    match: combo({ key: 'e', mod: true, shift: true }),
    run: (ctx) => ctx.exportPng(),
  },
  {
    group: 'Board',
    label: 'Keyboard shortcuts',
    keys: [['?']],
    match: (e) => e.key === '?' && !e.metaKey && !e.ctrlKey,
    run: (ctx) => ctx.toggleCheatsheet(),
  },
];

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Handles a keydown on the board. Returns true when the key was consumed. */
export function handleShortcut(e: KeyboardEvent, ctx: ShortcutContext): boolean {
  const arrow = ARROWS[e.key];
  if (arrow && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (ctx.editor.state.selection.size === 0) return false;
    ctx.editor.nudge(arrow[0], arrow[1], e.shiftKey);
    return true;
  }
  const digit = /^Digit([1-7])$/.exec(e.code);
  if (digit && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const ink = INKS[Number(digit[1]) - 1];
    if (ink) ctx.editor.setStyle({ ink });
    return true;
  }
  for (const shortcut of SHORTCUTS) {
    if (shortcut.match?.(e) && shortcut.run) {
      shortcut.run(ctx);
      return true;
    }
  }
  return false;
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function keyLabel(key: string): string {
  if (!IS_MAC) return key === 'Mod' ? 'Ctrl' : key;
  switch (key) {
    case 'Mod':
      return '⌘';
    case 'Shift':
      return '⇧';
    case 'Alt':
      return '⌥';
    default:
      return key;
  }
}
