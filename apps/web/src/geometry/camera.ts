import type { Point, Rect } from './vec.ts';

/** `x`/`y` is the world point at the top-left of the viewport. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(cam: Camera, p: Point): Point {
  return { x: cam.x + p.x / cam.zoom, y: cam.y + p.y / cam.zoom };
}

export function worldToScreen(cam: Camera, p: Point): Point {
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom };
}

/** Zooms so the world point under `anchor` (screen space) stays under it. */
export function zoomAt(cam: Camera, anchor: Point, zoom: number): Camera {
  const next = clampZoom(zoom);
  const world = screenToWorld(cam, anchor);
  return { x: world.x - anchor.x / next, y: world.y - anchor.y / next, zoom: next };
}

export function panBy(cam: Camera, dx: number, dy: number): Camera {
  return { ...cam, x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom };
}

export function viewportRect(cam: Camera, width: number, height: number): Rect {
  return { x: cam.x, y: cam.y, w: width / cam.zoom, h: height / cam.zoom };
}

/** Next zoom stop above or below the current zoom, for the +/- controls. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > zoom + 1e-3) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - 1e-3) ?? MIN_ZOOM;
}

/** Camera that fits `bounds` in the viewport with padding, never zooming in past 100%. */
export function fitCamera(
  bounds: Rect,
  width: number,
  height: number,
  padding: number,
  maxZoom = 1,
): Camera {
  const availW = Math.max(1, width - padding * 2);
  const availH = Math.max(1, height - padding * 2);
  const zoom = clampZoom(
    Math.min(maxZoom, availW / Math.max(bounds.w, 1), availH / Math.max(bounds.h, 1)),
  );
  return {
    zoom,
    x: bounds.x + bounds.w / 2 - width / 2 / zoom,
    y: bounds.y + bounds.h / 2 - height / 2 / zoom,
  };
}

/** Camera centered on a world point at the given zoom. */
export function centerOn(p: Point, width: number, height: number, zoom: number): Camera {
  return { zoom, x: p.x - width / 2 / zoom, y: p.y - height / 2 / zoom };
}

export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  // Interpolating zoom in log space keeps the animation speed even.
  const zoom = Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, zoom };
}
