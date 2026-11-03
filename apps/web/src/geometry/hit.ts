import type { Shape } from '@chalkline/core';
import { geomBounds, penWorldPoints, renderBounds, strokeWidth } from './bounds.ts';
import type { MeasureText } from './text.ts';
import {
  distToSegmentSq,
  expandRect,
  rectContainsPoint,
  rectContainsRect,
  rectsOverlap,
  segmentDistanceSq,
  segmentIntersectsRect,
  segmentRectDistanceSq,
  type Point,
  type Rect,
} from './vec.ts';

const ELLIPSE_SEGMENTS = 48;

/** Shapes whose inside counts as the shape, not just the outline. */
function isSolid(shape: Shape): boolean {
  return (
    shape.kind === 'text' ||
    shape.kind === 'sticky' ||
    ((shape.kind === 'rect' || shape.kind === 'ellipse') && shape.fill !== 'none')
  );
}

/** The visible outline as polylines in world space. */
function outline(shape: Shape): Point[][] {
  switch (shape.kind) {
    case 'pen': {
      const pts = penWorldPoints(shape);
      const line: Point[] = [];
      for (let i = 0; i + 2 < pts.length; i += 3) {
        line.push({ x: pts[i] as number, y: pts[i + 1] as number });
      }
      return [line];
    }
    case 'line':
    case 'arrow':
      return [
        [
          { x: shape.x, y: shape.y },
          { x: shape.x + shape.dx, y: shape.y + shape.dy },
        ],
      ];
    case 'sticky':
    case 'text':
      return [];
    case 'rect': {
      const { x, y, w, h } = shape;
      return [
        [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y },
        ],
      ];
    }
    case 'ellipse': {
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      const ring: Point[] = [];
      for (let i = 0; i <= ELLIPSE_SEGMENTS; i++) {
        const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
        ring.push({ x: cx + (Math.cos(t) * shape.w) / 2, y: cy + (Math.sin(t) * shape.h) / 2 });
      }
      return [ring];
    }
  }
}

function insideRegion(shape: Shape, p: Point, measure: MeasureText): boolean {
  if (shape.kind === 'ellipse') {
    const rx = shape.w / 2;
    const ry = shape.h / 2;
    const nx = (p.x - (shape.x + rx)) / rx;
    const ny = (p.y - (shape.y + ry)) / ry;
    return nx * nx + ny * ny <= 1;
  }
  return rectContainsPoint(geomBounds(shape, measure), p);
}

function polylineNear(lines: Point[][], p: Point, reach: number): boolean {
  const reachSq = reach * reach;
  for (const line of lines) {
    if (line.length === 1 && distToSegmentSq(p, line[0] as Point, line[0] as Point) <= reachSq) {
      return true;
    }
    for (let i = 1; i < line.length; i++) {
      if (distToSegmentSq(p, line[i - 1] as Point, line[i] as Point) <= reachSq) return true;
    }
  }
  return false;
}

/** Whether a click at `p` lands on the shape. `tolerance` is in world units. */
export function hitShape(shape: Shape, p: Point, tolerance: number, measure: MeasureText): boolean {
  if (!rectContainsPoint(expandRect(renderBounds(shape, measure), tolerance), p)) return false;
  if (isSolid(shape) && insideRegion(shape, p, measure)) return true;
  return polylineNear(outline(shape), p, tolerance + strokeWidth(shape) / 2);
}

/** Marquee selection: true when the rectangle touches any visible part of the shape. */
export function shapeIntersectsRect(shape: Shape, r: Rect, measure: MeasureText): boolean {
  const geom = geomBounds(shape, measure);
  if (!rectsOverlap(renderBounds(shape, measure), r)) return false;
  if (rectContainsRect(r, geom)) return true;
  if (isSolid(shape)) {
    if (shape.kind !== 'ellipse') return true;
    const corners = [
      { x: r.x, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x, y: r.y + r.h },
      { x: r.x + r.w, y: r.y + r.h },
    ];
    if (corners.some((c) => insideRegion(shape, c, measure))) return true;
  }
  for (const line of outline(shape)) {
    if (line.length === 1 && rectContainsPoint(r, line[0] as Point)) return true;
    for (let i = 1; i < line.length; i++) {
      if (segmentIntersectsRect(line[i - 1] as Point, line[i] as Point, r)) return true;
    }
  }
  return false;
}

/** Eraser: whether a circle of `radius` swept from `a` to `b` touches the shape. */
export function shapeTouchesSweep(
  shape: Shape,
  a: Point,
  b: Point,
  radius: number,
  measure: MeasureText,
): boolean {
  const sweep: Rect = {
    x: Math.min(a.x, b.x) - radius,
    y: Math.min(a.y, b.y) - radius,
    w: Math.abs(b.x - a.x) + radius * 2,
    h: Math.abs(b.y - a.y) + radius * 2,
  };
  if (!rectsOverlap(renderBounds(shape, measure), sweep)) return false;
  if (isSolid(shape)) {
    if (shape.kind === 'ellipse') {
      if (insideRegion(shape, a, measure) || insideRegion(shape, b, measure)) return true;
    } else if (segmentRectDistanceSq(a, b, geomBounds(shape, measure)) <= radius * radius) {
      return true;
    }
  }
  const reach = radius + strokeWidth(shape) / 2;
  const reachSq = reach * reach;
  for (const line of outline(shape)) {
    if (line.length === 1 && distToSegmentSq(line[0] as Point, a, b) <= reachSq) return true;
    for (let i = 1; i < line.length; i++) {
      if (segmentDistanceSq(a, b, line[i - 1] as Point, line[i] as Point) <= reachSq) return true;
    }
  }
  return false;
}
