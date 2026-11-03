import type { Shape, ShapePatch } from '@chalkline/core';
import { shapeIntersectsRect } from '../../geometry/hit.ts';
import { handleCursor, resizeRect, transformShape, type Handle } from '../../geometry/transform.ts';
import {
  rectContainsPoint,
  rectFromPoints,
  snapAngle,
  type Point,
  type Rect,
} from '../../geometry/vec.ts';
import type { Editor } from '../editor.ts';
import type { BoardPointer, Tool } from './tool.ts';

const DRAG_THRESHOLD_PX = 3;
const DOUBLE_CLICK_MS = 350;
const MIN_SIZE = 4;

interface Gesture {
  move(p: BoardPointer): void;
  up(): void;
  cancel(): void;
  removed?(ids: ReadonlySet<string>): void;
}

/**
 * Click to select, Shift-click to toggle, drag empty space for a marquee,
 * drag a selection to move it (Alt-drag moves a copy), and drag handles to
 * resize. Double-click text or a sticky note to edit it, or empty space to
 * start a new text.
 */
export class SelectTool implements Tool {
  readonly cursor = 'default';
  private gesture: Gesture | null = null;
  private lastDown = { time: 0, x: 0, y: 0 };
  private readonly editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  down(p: BoardPointer): void {
    const editor = this.editor;
    const double =
      p.time - this.lastDown.time < DOUBLE_CLICK_MS &&
      Math.hypot(p.screen.x - this.lastDown.x, p.screen.y - this.lastDown.y) < 6;
    this.lastDown = { time: double ? 0 : p.time, x: p.screen.x, y: p.screen.y };

    const handle = editor.handleAt(p.screen);
    if (handle && !double) {
      this.gesture =
        handle.kind === 'line'
          ? new LineEndGesture(editor, handle.id, handle.end)
          : new ResizeGesture(editor, handle.handle);
      return;
    }

    const hit = editor.scene.hit(p.world, editor.tolerance());
    if (double) {
      if (hit && (hit.kind === 'text' || hit.kind === 'sticky')) editor.startEditing(hit.id);
      else if (!hit) editor.startDraft(p.world);
      return;
    }

    const selection = editor.state.selection;
    if (hit) {
      if (p.shift) {
        const next = new Set(selection);
        if (next.has(hit.id)) next.delete(hit.id);
        else next.add(hit.id);
        editor.select(next);
        if (!next.has(hit.id)) return;
      } else if (!selection.has(hit.id)) {
        editor.select([hit.id]);
      }
      this.gesture = new MoveGesture(editor, p);
      return;
    }

    const frame = editor.selectionBounds();
    if (!p.shift && selection.size > 1 && frame && rectContainsPoint(frame, p.world)) {
      this.gesture = new MoveGesture(editor, p);
      return;
    }
    if (!p.shift) editor.select([]);
    this.gesture = new MarqueeGesture(editor, p, p.shift ? selection : new Set());
  }

  move(p: BoardPointer): void {
    this.gesture?.move(p);
  }

  up(): void {
    this.gesture?.up();
    this.gesture = null;
  }

  cancel(): void {
    this.gesture?.cancel();
    this.gesture = null;
  }

  removed(ids: ReadonlySet<string>): void {
    this.gesture?.removed?.(ids);
  }

  hover(p: BoardPointer): void {
    const editor = this.editor;
    const handle = editor.handleAt(p.screen);
    if (handle) {
      editor.setHover(null, handle.kind === 'line' ? 'crosshair' : handleCursor(handle.handle));
      return;
    }
    const hit = editor.scene.hit(p.world, editor.tolerance());
    const cursor = hit ? (editor.state.selection.has(hit.id) ? 'move' : 'pointer') : 'default';
    editor.setHover(hit?.id ?? null, cursor);
  }
}

class MoveGesture implements Gesture {
  private started = false;
  private origins = new Map<string, Point>();
  private readonly start: Point;
  private readonly startScreen: Point;
  private readonly duplicate: boolean;
  private readonly editor: Editor;

  constructor(editor: Editor, p: BoardPointer) {
    this.editor = editor;
    this.start = p.world;
    this.startScreen = p.screen;
    this.duplicate = p.alt;
  }

  move(p: BoardPointer): void {
    const editor = this.editor;
    if (!this.started) {
      const moved = Math.hypot(p.screen.x - this.startScreen.x, p.screen.y - this.startScreen.y);
      if (moved < DRAG_THRESHOLD_PX) return;
      this.started = true;
      editor.history.cut();
      let ids = [...editor.state.selection];
      if (this.duplicate) {
        ids = editor.board.duplicate(ids, 0, 0);
        editor.select(ids);
      }
      for (const id of ids) {
        const shape = editor.scene.get(id)?.shape;
        if (shape) this.origins.set(id, { x: shape.x, y: shape.y });
      }
    }
    let dx = p.world.x - this.start.x;
    let dy = p.world.y - this.start.y;
    if (p.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const patches = new Map<string, ShapePatch>();
    for (const [id, origin] of this.origins)
      patches.set(id, { x: origin.x + dx, y: origin.y + dy });
    editor.board.updateMany(patches);
  }

  up(): void {
    if (this.started) this.editor.history.cut();
  }

  cancel(): void {
    if (!this.started) return;
    const patches = new Map<string, ShapePatch>();
    for (const [id, origin] of this.origins) patches.set(id, { x: origin.x, y: origin.y });
    this.editor.board.updateMany(patches);
    this.editor.history.cut();
  }

  removed(ids: ReadonlySet<string>): void {
    let lost = 0;
    for (const id of ids) if (this.origins.delete(id)) lost++;
    if (lost > 0) {
      this.editor.notify({
        message:
          lost === 1
            ? 'Someone deleted a shape you were moving.'
            : `Someone deleted ${lost} shapes you were moving.`,
      });
    }
  }
}

class ResizeGesture implements Gesture {
  private readonly originals: Shape[];
  private readonly frame: Rect;
  private readonly hasText: boolean;
  private started = false;
  private readonly editor: Editor;
  private readonly handle: Handle;

  constructor(editor: Editor, handle: Handle) {
    this.editor = editor;
    this.handle = handle;
    this.originals = editor.selectedShapes();
    this.frame = editor.selectionBounds() ?? { x: 0, y: 0, w: 1, h: 1 };
    this.hasText = this.originals.some((s) => s.kind === 'text');
  }

  move(p: BoardPointer): void {
    if (!this.started) {
      this.started = true;
      this.editor.history.cut();
    }
    const next = resizeRect(this.frame, this.handle, p.world, {
      aspect: p.shift || this.hasText,
      center: p.alt,
      minSize: MIN_SIZE,
    });
    const patches = new Map<string, ShapePatch>();
    for (const shape of this.originals) {
      if (this.editor.board.has(shape.id)) {
        patches.set(shape.id, transformShape(shape, this.frame, next));
      }
    }
    this.editor.board.updateMany(patches);
  }

  up(): void {
    if (this.started) this.editor.history.cut();
  }

  cancel(): void {
    if (!this.started) return;
    const patches = new Map<string, ShapePatch>();
    for (const shape of this.originals)
      patches.set(shape.id, transformShape(shape, this.frame, this.frame));
    this.editor.board.updateMany(patches);
    this.editor.history.cut();
  }
}

class LineEndGesture implements Gesture {
  private readonly original: Shape | undefined;
  private started = false;
  private readonly editor: Editor;
  private readonly id: string;
  private readonly end: 'start' | 'end';

  constructor(editor: Editor, id: string, end: 'start' | 'end') {
    this.editor = editor;
    this.id = id;
    this.end = end;
    this.original = editor.scene.get(id)?.shape;
  }

  move(p: BoardPointer): void {
    const line = this.original;
    if (!line || (line.kind !== 'line' && line.kind !== 'arrow')) return;
    if (!this.started) {
      this.started = true;
      this.editor.history.cut();
    }
    const fixed =
      this.end === 'end' ? { x: line.x, y: line.y } : { x: line.x + line.dx, y: line.y + line.dy };
    const moving = p.shift ? snapAngle(fixed, p.world, 15) : p.world;
    const patch =
      this.end === 'end'
        ? { dx: moving.x - fixed.x, dy: moving.y - fixed.y }
        : { x: moving.x, y: moving.y, dx: fixed.x - moving.x, dy: fixed.y - moving.y };
    this.editor.board.update(this.id, patch);
  }

  up(): void {
    if (this.started) this.editor.history.cut();
  }

  cancel(): void {
    const line = this.original;
    if (!this.started || !line || (line.kind !== 'line' && line.kind !== 'arrow')) return;
    this.editor.board.update(this.id, { x: line.x, y: line.y, dx: line.dx, dy: line.dy });
    this.editor.history.cut();
  }
}

class MarqueeGesture implements Gesture {
  private readonly start: Point;
  private readonly base: ReadonlySet<string>;
  private readonly editor: Editor;

  constructor(editor: Editor, p: BoardPointer, base: ReadonlySet<string>) {
    this.editor = editor;
    this.start = p.world;
    this.base = base;
  }

  move(p: BoardPointer): void {
    const editor = this.editor;
    const rect = rectFromPoints(this.start, p.world);
    editor.overlay.marquee = rect;
    const ids = new Set(this.base);
    for (const entry of editor.scene.query(rect)) {
      if (shapeIntersectsRect(entry.shape, rect, editor.measure)) ids.add(entry.shape.id);
    }
    editor.select(ids);
    editor.requestRender();
  }

  up(): void {
    this.editor.overlay.marquee = null;
    this.editor.requestRender();
  }

  cancel(): void {
    this.editor.overlay.marquee = null;
    this.editor.select(this.base);
  }
}
