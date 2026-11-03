import type { Shape, ShapePatch } from '@chalkline/core';
import type { Point, Rect } from './vec.ts';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const CORNER_HANDLES: readonly Handle[] = ['nw', 'ne', 'se', 'sw'];
export const ALL_HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function handlePoint(r: Rect, handle: Handle): Point {
  const x = handle.includes('w') ? r.x : handle.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const y = handle.includes('n') ? r.y : handle.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { x, y };
}

export function handleCursor(handle: Handle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
  }
}

export interface ResizeOptions {
  /** Keep the starting aspect ratio (Shift, and always for text). */
  aspect: boolean;
  /** Resize symmetrically around the center (Alt). */
  center: boolean;
  minSize: number;
}

/**
 * New selection box for a handle dragged to `p`. The box never flips: dragging
 * past the opposite edge stops at `minSize`, which keeps the math for pen
 * strokes and text (which cannot mirror) simple and predictable.
 */
export function resizeRect(start: Rect, handle: Handle, p: Point, opts: ResizeOptions): Rect {
  const min = opts.minSize;
  const cx = start.x + start.w / 2;
  const cy = start.y + start.h / 2;
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  const movesX = handle.includes('w') || handle.includes('e');
  const movesY = handle.includes('n') || handle.includes('s');

  if (opts.center) {
    if (movesX) {
      const half = Math.max(min / 2, Math.abs(p.x - cx));
      left = cx - half;
      right = cx + half;
    }
    if (movesY) {
      const half = Math.max(min / 2, Math.abs(p.y - cy));
      top = cy - half;
      bottom = cy + half;
    }
  } else {
    if (handle.includes('w')) left = Math.min(p.x, right - min);
    if (handle.includes('e')) right = Math.max(p.x, left + min);
    if (handle.includes('n')) top = Math.min(p.y, bottom - min);
    if (handle.includes('s')) bottom = Math.max(p.y, top + min);
  }

  if (opts.aspect && start.w > 0 && start.h > 0) {
    const sx = (right - left) / start.w;
    const sy = (bottom - top) / start.h;
    const scale = Math.max(
      movesX && movesY ? Math.max(sx, sy) : movesX ? sx : sy,
      min / Math.min(start.w, start.h),
    );
    const w = start.w * scale;
    const h = start.h * scale;
    if (opts.center) {
      left = cx - w / 2;
      top = cy - h / 2;
    } else {
      left = handle.includes('w') ? right - w : handle.includes('e') ? left : cx - w / 2;
      top = handle.includes('n') ? bottom - h : handle.includes('s') ? top : cy - h / 2;
    }
    right = left + w;
    bottom = top + h;
  }

  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Maps a shape from its place inside `from` to the same relative place inside
 * `to`. Applied to the shape as it was when the gesture started, never
 * cumulatively, so rounding does not drift during a long drag.
 */
export function transformShape(shape: Shape, from: Rect, to: Rect): ShapePatch {
  const sx = from.w > 1e-6 ? to.w / from.w : 1;
  const sy = from.h > 1e-6 ? to.h / from.h : 1;
  const x = to.x + (shape.x - from.x) * sx;
  const y = to.y + (shape.y - from.y) * sy;
  switch (shape.kind) {
    case 'pen':
      return { x, y, sx: shape.sx * sx, sy: shape.sy * sy };
    case 'rect':
    case 'ellipse':
    case 'sticky':
      return { x, y, w: shape.w * sx, h: shape.h * sy };
    case 'line':
    case 'arrow':
      return { x, y, dx: shape.dx * sx, dy: shape.dy * sy };
    case 'text': {
      // Text scales uniformly; a lopsided drag uses the larger axis.
      const uniform = from.w > 1e-6 && from.h > 1e-6 ? Math.max(sx, sy) : sx * sy;
      return { x, y, scale: shape.scale * uniform };
    }
  }
}
