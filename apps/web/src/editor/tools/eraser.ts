import { shapeTouchesSweep } from '../../geometry/hit.ts';
import type { Point } from '../../geometry/vec.ts';
import type { Editor } from '../editor.ts';
import type { BoardPointer, Tool } from './tool.ts';

/** Eraser radius in screen pixels, so it feels the same at any zoom. */
export const ERASER_RADIUS_PX = 10;
const TRAIL_MS = 220;

/**
 * Shapes the eraser touches fade while the button is held and are deleted
 * together on release, as one undo step.
 */
export class EraserTool implements Tool {
  readonly cursor = 'none';
  private last: Point | null = null;
  private readonly editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  down(p: BoardPointer): void {
    this.last = p.world;
    this.editor.overlay.erasing.clear();
    this.sweep(p.world, p.world, p.time);
  }

  move(p: BoardPointer): void {
    if (!this.last) return;
    for (const sample of p.samples) {
      this.sweep(this.last, sample.world, p.time);
      this.last = sample.world;
    }
  }

  up(): void {
    const { overlay, history, board } = this.editor;
    if (overlay.erasing.size > 0) {
      history.cut();
      board.remove(overlay.erasing);
      history.cut();
    }
    this.reset();
  }

  cancel(): void {
    this.reset();
  }

  hover(p: BoardPointer): void {
    const { overlay } = this.editor;
    overlay.eraserTrail = [{ p: p.world, t: p.time }];
    this.editor.requestRender();
  }

  private sweep(a: Point, b: Point, time: number): void {
    const { scene, overlay, measure } = this.editor;
    const radius = ERASER_RADIUS_PX / this.editor.camera.zoom;
    const area = {
      x: Math.min(a.x, b.x) - radius,
      y: Math.min(a.y, b.y) - radius,
      w: Math.abs(b.x - a.x) + radius * 2,
      h: Math.abs(b.y - a.y) + radius * 2,
    };
    for (const entry of scene.query(area)) {
      if (
        !overlay.erasing.has(entry.shape.id) &&
        shapeTouchesSweep(entry.shape, a, b, radius, measure)
      ) {
        overlay.erasing.add(entry.shape.id);
      }
    }
    overlay.eraserTrail = [
      ...overlay.eraserTrail.filter((s) => time - s.t < TRAIL_MS),
      { p: b, t: time },
    ];
    this.editor.requestRender();
  }

  private reset(): void {
    this.last = null;
    this.editor.overlay.erasing.clear();
    this.editor.requestRender();
  }
}
