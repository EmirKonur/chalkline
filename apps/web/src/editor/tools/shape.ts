import type { Editor } from '../editor.ts';
import { rectFromPoints, snapAngle, type Point } from '../../geometry/vec.ts';
import type { BoardPointer, Tool } from './tool.ts';

const DRAG_THRESHOLD_PX = 3;
const DEFAULT_BOX = { w: 160, h: 100 };
const DEFAULT_LINE = 160;

/**
 * Rectangle and ellipse. Drag to size (Shift for a square or circle, Alt to
 * draw from the center), or click to drop a default-sized one.
 */
export class BoxTool implements Tool {
  readonly cursor = 'crosshair';
  private anchor: Point | null = null;
  private anchorScreen: Point = { x: 0, y: 0 };
  private id: string | null = null;
  private readonly editor: Editor;
  private readonly kind: 'rect' | 'ellipse';

  constructor(editor: Editor, kind: 'rect' | 'ellipse') {
    this.editor = editor;
    this.kind = kind;
  }

  down(p: BoardPointer): void {
    this.anchor = p.world;
    this.anchorScreen = p.screen;
    this.id = null;
  }

  move(p: BoardPointer): void {
    if (!this.anchor) return;
    if (!this.id) {
      const moved = Math.hypot(p.screen.x - this.anchorScreen.x, p.screen.y - this.anchorScreen.y);
      if (moved < DRAG_THRESHOLD_PX) return;
      this.editor.history.cut();
      this.id = this.create(this.anchor.x, this.anchor.y, 1, 1);
    }
    let corner = p.world;
    if (p.shift) {
      const side = Math.max(Math.abs(corner.x - this.anchor.x), Math.abs(corner.y - this.anchor.y));
      corner = {
        x: this.anchor.x + Math.sign(corner.x - this.anchor.x || 1) * side,
        y: this.anchor.y + Math.sign(corner.y - this.anchor.y || 1) * side,
      };
    }
    const start = p.alt
      ? { x: this.anchor.x * 2 - corner.x, y: this.anchor.y * 2 - corner.y }
      : this.anchor;
    const r = rectFromPoints(start, corner);
    this.editor.board.update(this.id, { x: r.x, y: r.y, w: Math.max(1, r.w), h: Math.max(1, r.h) });
  }

  up(): void {
    if (!this.anchor) return;
    if (!this.id) {
      this.editor.history.cut();
      this.id = this.create(
        this.anchor.x - DEFAULT_BOX.w / 2,
        this.anchor.y - DEFAULT_BOX.h / 2,
        DEFAULT_BOX.w,
        DEFAULT_BOX.h,
      );
    }
    this.editor.history.cut();
    this.editor.finishCreating(this.id);
    this.anchor = null;
    this.id = null;
  }

  cancel(): void {
    if (this.id) this.editor.board.remove([this.id]);
    this.anchor = null;
    this.id = null;
    this.editor.history.cut();
  }

  private create(x: number, y: number, w: number, h: number): string {
    const { ink, size, fill } = this.editor.state.style;
    return this.editor.board.create({ kind: this.kind, x, y, w, h, fill, ink, size });
  }
}

/** Line and arrow. Shift snaps the angle to 15 degree steps. */
export class LineTool implements Tool {
  readonly cursor = 'crosshair';
  private anchor: Point | null = null;
  private anchorScreen: Point = { x: 0, y: 0 };
  private id: string | null = null;
  private readonly editor: Editor;
  private readonly kind: 'line' | 'arrow';

  constructor(editor: Editor, kind: 'line' | 'arrow') {
    this.editor = editor;
    this.kind = kind;
  }

  down(p: BoardPointer): void {
    this.anchor = p.world;
    this.anchorScreen = p.screen;
    this.id = null;
  }

  move(p: BoardPointer): void {
    if (!this.anchor) return;
    if (!this.id) {
      const moved = Math.hypot(p.screen.x - this.anchorScreen.x, p.screen.y - this.anchorScreen.y);
      if (moved < DRAG_THRESHOLD_PX) return;
      this.editor.history.cut();
      this.id = this.create(this.anchor, 0, 0);
    }
    const end = p.shift ? snapAngle(this.anchor, p.world, 15) : p.world;
    this.editor.board.update(this.id, { dx: end.x - this.anchor.x, dy: end.y - this.anchor.y });
  }

  up(): void {
    if (!this.anchor) return;
    if (!this.id) {
      this.editor.history.cut();
      this.id = this.create(
        { x: this.anchor.x - DEFAULT_LINE / 2, y: this.anchor.y },
        DEFAULT_LINE,
        0,
      );
    }
    this.editor.history.cut();
    this.editor.finishCreating(this.id);
    this.anchor = null;
    this.id = null;
  }

  cancel(): void {
    if (this.id) this.editor.board.remove([this.id]);
    this.anchor = null;
    this.id = null;
    this.editor.history.cut();
  }

  private create(at: Point, dx: number, dy: number): string {
    const { ink, size } = this.editor.state.style;
    return this.editor.board.create({ kind: this.kind, x: at.x, y: at.y, dx, dy, ink, size });
  }
}
