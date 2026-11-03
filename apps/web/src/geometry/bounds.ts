import { FONT_SIZE, STROKE_WIDTH, type PenShape, type Shape } from '@chalkline/core';
import { layoutText, type MeasureText } from './text.ts';
import { expandRect, type Rect } from './vec.ts';

/** Pens draw a bit wider than shape outlines of the same size token. */
export const PEN_WIDTH_FACTOR = 1.5;
export const ARROW_HEAD = 4;

export function strokeWidth(shape: Shape): number {
  const base = STROKE_WIDTH[shape.size];
  return shape.kind === 'pen' ? base * PEN_WIDTH_FACTOR : base;
}

export function fontSizeOf(shape: Shape & { kind: 'text' }): number {
  return FONT_SIZE[shape.size] * shape.scale;
}

/** Pen points in world space, as [x, y, pressure] triples. */
export function penWorldPoints(shape: PenShape): number[] {
  const out = new Array<number>(shape.points.length);
  for (let i = 0; i + 2 < shape.points.length; i += 3) {
    out[i] = shape.x + (shape.points[i] as number) * shape.sx;
    out[i + 1] = shape.y + (shape.points[i + 1] as number) * shape.sy;
    out[i + 2] = shape.points[i + 2] as number;
  }
  return out;
}

/** The box people select and resize: geometry only, no stroke width. */
export function geomBounds(shape: Shape, measure: MeasureText): Rect {
  switch (shape.kind) {
    case 'pen': {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i + 2 < shape.points.length; i += 3) {
        const x = (shape.points[i] as number) * shape.sx;
        const y = (shape.points[i + 1] as number) * shape.sy;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      if (minX === Infinity) return { x: shape.x, y: shape.y, w: 0, h: 0 };
      return { x: shape.x + minX, y: shape.y + minY, w: maxX - minX, h: maxY - minY };
    }
    case 'rect':
    case 'ellipse':
    case 'sticky':
      return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    case 'line':
    case 'arrow':
      return {
        x: Math.min(shape.x, shape.x + shape.dx),
        y: Math.min(shape.y, shape.y + shape.dy),
        w: Math.abs(shape.dx),
        h: Math.abs(shape.dy),
      };
    case 'text': {
      const layout = layoutText(shape.text, fontSizeOf(shape), measure);
      return { x: shape.x, y: shape.y, w: layout.width, h: layout.height };
    }
  }
}

/** Everything the shape paints, used for viewport culling and dirty checks. */
export function renderBounds(shape: Shape, measure: MeasureText): Rect {
  const geom = geomBounds(shape, measure);
  switch (shape.kind) {
    case 'pen':
      return expandRect(geom, strokeWidth(shape));
    case 'arrow':
      return expandRect(geom, strokeWidth(shape) * ARROW_HEAD + 2);
    case 'sticky':
      return { x: geom.x - 2, y: geom.y - 2, w: geom.w + 8, h: geom.h + 10 };
    case 'text':
      return expandRect(geom, 2);
    default:
      return expandRect(geom, strokeWidth(shape) / 2 + 1);
  }
}
