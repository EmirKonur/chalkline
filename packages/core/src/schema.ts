/**
 * The board document schema. Everything a client can render lives in the
 * `shapes` map of the Y.Doc, keyed by shape id, with one nested Y.Map per
 * shape. Colors are stored as ink tokens rather than hex values so each viewer
 * can render the same board in either theme.
 */

export const INKS = ['chalk', 'pink', 'butter', 'sky', 'mint', 'lilac', 'peach'] as const;
export type Ink = (typeof INKS)[number];

export const SIZES = ['s', 'm', 'l', 'xl'] as const;
export type Size = (typeof SIZES)[number];

export const FILLS = ['none', 'tint', 'solid'] as const;
export type Fill = (typeof FILLS)[number];

export const SHAPE_KINDS = ['pen', 'rect', 'ellipse', 'line', 'arrow', 'text', 'sticky'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Stroke width in world units for each size token. */
export const STROKE_WIDTH: Record<Size, number> = { s: 2, m: 4, l: 7, xl: 12 };

/** Base font size in world units for text shapes. */
export const FONT_SIZE: Record<Size, number> = { s: 18, m: 26, l: 38, xl: 56 };

interface ShapeCommon {
  id: string;
  /** World-space origin. For pens and lines, points are relative to it. */
  x: number;
  y: number;
  /** Fractional index; shapes render in ascending (z, id) order. */
  z: string;
  ink: Ink;
  size: Size;
}

export interface PenShape extends ShapeCommon {
  kind: 'pen';
  /** Flattened [x, y, pressure] triples, relative to (x, y), in world units. */
  points: readonly number[];
  /** True when pressure came from a stylus rather than being simulated. */
  realPressure: boolean;
  /**
   * Scale applied to the points. Resizing a stroke writes these two numbers
   * instead of rewriting every point, so a live resize stays cheap on the wire.
   */
  sx: number;
  sy: number;
}

export interface BoxShape extends ShapeCommon {
  kind: 'rect' | 'ellipse';
  w: number;
  h: number;
  fill: Fill;
}

export interface LineShape extends ShapeCommon {
  kind: 'line' | 'arrow';
  /** End point relative to (x, y). */
  dx: number;
  dy: number;
}

export interface TextShape extends ShapeCommon {
  kind: 'text';
  text: string;
  /** Uniform scale applied on top of FONT_SIZE[size] by resizing. */
  scale: number;
}

export interface StickyShape extends ShapeCommon {
  kind: 'sticky';
  w: number;
  h: number;
  text: string;
}

export type Shape = PenShape | BoxShape | LineShape | TextShape | StickyShape;

/** A shape description without identity or stacking, used to create shapes. */
export type ShapeInit = DistributiveOmit<Shape, 'id' | 'z'> & { id?: string; z?: string };

/** Fields that may be patched on an existing shape. Text and points have their own operations. */
export type ShapePatch = Partial<{
  x: number;
  y: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  scale: number;
  sx: number;
  sy: number;
  ink: Ink;
  size: Size;
  fill: Fill;
  z: string;
}>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function isInk(value: unknown): value is Ink {
  return typeof value === 'string' && (INKS as readonly string[]).includes(value);
}

export function isSize(value: unknown): value is Size {
  return typeof value === 'string' && (SIZES as readonly string[]).includes(value);
}

export function isFill(value: unknown): value is Fill {
  return typeof value === 'string' && (FILLS as readonly string[]).includes(value);
}

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === 'string' && (SHAPE_KINDS as readonly string[]).includes(value);
}
