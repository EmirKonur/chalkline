import type { Fill, Ink, Size } from '@chalkline/core';
import type { Camera } from '../geometry/camera.ts';
import type { Point } from '../geometry/vec.ts';
import type { ThemeName } from '../theme/palette.ts';

export type ToolId =
  'select' | 'hand' | 'pen' | 'eraser' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'sticky';

export interface StyleState {
  ink: Ink;
  size: Size;
  fill: Fill;
}

/** Text being typed: either an existing shape, or a spot where a text shape will appear. */
export type Editing = { kind: 'shape'; id: string } | { kind: 'draft'; at: Point };

export interface EditorState {
  tool: ToolId;
  style: StyleState;
  selection: ReadonlySet<string>;
  editing: Editing | null;
  /** Increments each time text editing starts, so the overlay remounts per session. */
  editSession: number;
  camera: Camera;
  viewport: { width: number; height: number };
  theme: ThemeName;
  grid: boolean;
  /** CSS cursor for the canvas. */
  cursor: string;
  /** Space is held, so dragging pans. */
  spacePan: boolean;
  /** A pointer gesture is in progress; floating UI steps aside. */
  pointerActive: boolean;
}

export const EMPTY_SELECTION: ReadonlySet<string> = new Set();

export function initialEditorState(theme: ThemeName): EditorState {
  return {
    tool: 'pen',
    style: { ink: 'chalk', size: 'm', fill: 'none' },
    selection: EMPTY_SELECTION,
    editing: null,
    editSession: 0,
    camera: { x: 0, y: 0, zoom: 1 },
    viewport: { width: 0, height: 0 },
    theme,
    grid: true,
    cursor: 'crosshair',
    spacePan: false,
    pointerActive: false,
  };
}
