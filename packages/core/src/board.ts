import * as Y from 'yjs';
import { newShapeId } from './ids.ts';
import { decodePoints, encodePoints } from './points.ts';
import {
  FILLS,
  isFill,
  isInk,
  isShapeKind,
  isSize,
  type Shape,
  type ShapeInit,
  type ShapePatch,
} from './schema.ts';
import {
  backward,
  compareStacked,
  forward,
  keysBetween,
  toBack,
  toFront,
  type Stacked,
} from './zorder.ts';

export const SHAPES_KEY = 'shapes';
export const META_KEY = 'meta';
export const TITLE_MAX_LENGTH = 80;

type ShapeMap = Y.Map<unknown>;

/**
 * Typed operations over the board's Y.Doc. Every write runs in a transaction
 * tagged with `origin`, which is how the undo manager tells this client's
 * edits apart from edits that arrived over the network.
 */
export class Board {
  readonly doc: Y.Doc;
  readonly origin: object;
  readonly shapes: Y.Map<ShapeMap>;
  readonly meta: Y.Map<unknown>;

  constructor(doc: Y.Doc, origin: object = {}) {
    this.doc = doc;
    this.origin = origin;
    this.shapes = doc.getMap<ShapeMap>(SHAPES_KEY);
    this.meta = doc.getMap(META_KEY);
  }

  transact(fn: () => void): void {
    this.doc.transact(fn, this.origin);
  }

  has(id: string): boolean {
    return this.shapes.has(id);
  }

  get(id: string): Shape | null {
    const map = this.shapes.get(id);
    return map ? readShape(id, map) : null;
  }

  /** All valid shapes in render order (bottom first). */
  list(): Shape[] {
    const out: Shape[] = [];
    this.shapes.forEach((map, id) => {
      const shape = readShape(id, map);
      if (shape) out.push(shape);
    });
    return out.sort(compareStacked);
  }

  /** Just ids and keys in render order, which is all the z-order operations need. */
  stacking(): Stacked[] {
    const out: Stacked[] = [];
    this.shapes.forEach((map, id) => {
      const z = map.get('z');
      if (typeof z === 'string') out.push({ id, z });
    });
    return out.sort(compareStacked);
  }

  create(init: ShapeInit): string {
    return this.createMany([init])[0] as string;
  }

  /** Creates shapes in one transaction. Shapes without a z key stack above everything, in order. */
  createMany(inits: readonly ShapeInit[]): string[] {
    const ids: string[] = [];
    this.transact(() => {
      const needKeys = inits.filter((s) => s.z === undefined).length;
      const fresh = keysBetween(this.stacking().at(-1)?.z ?? null, null, needKeys);
      let k = 0;
      for (const init of inits) {
        const id = init.id ?? newShapeId();
        const z = init.z ?? fresh[k++];
        if (z === undefined) throw new Error('keysBetween returned fewer keys than requested');
        const map = new Y.Map<unknown>();
        this.shapes.set(id, map);
        writeShape(map, { ...init, id, z });
        ids.push(id);
      }
    });
    return ids;
  }

  /** Writes only the fields that actually change, so idle drags do not grow the document. */
  update(id: string, patch: ShapePatch): void {
    this.updateMany(new Map([[id, patch]]));
  }

  updateMany(patches: ReadonlyMap<string, ShapePatch>): void {
    this.transact(() => {
      for (const [id, patch] of patches) {
        const map = this.shapes.get(id);
        if (!map) continue;
        for (const [key, value] of Object.entries(patch)) {
          if (value !== undefined && map.get(key) !== value) map.set(key, value);
        }
      }
    });
  }

  remove(ids: Iterable<string>): void {
    this.transact(() => {
      for (const id of ids) this.shapes.delete(id);
    });
  }

  /** Appends points (relative to the shape origin) to a pen stroke that is still being drawn. */
  appendPoints(id: string, points: readonly number[]): void {
    const arr = this.shapes.get(id)?.get('points');
    if (!(arr instanceof Y.Array) || points.length === 0) return;
    this.transact(() => arr.push(encodePoints(points)));
  }

  textOf(id: string): Y.Text | null {
    const text = this.shapes.get(id)?.get('text');
    return text instanceof Y.Text ? text : null;
  }

  /** Sets a text or sticky shape's content with a minimal edit, so concurrent typing merges. */
  setText(id: string, next: string): void {
    const text = this.textOf(id);
    if (!text) return;
    this.transact(() => applyTextDiff(text, next));
  }

  restack(keys: ReadonlyMap<string, string>): void {
    if (keys.size === 0) return;
    this.transact(() => {
      for (const [id, z] of keys) this.shapes.get(id)?.set('z', z);
    });
  }

  bringToFront(ids: ReadonlySet<string>): void {
    this.restack(toFront(this.stacking(), ids));
  }

  sendToBack(ids: ReadonlySet<string>): void {
    this.restack(toBack(this.stacking(), ids));
  }

  bringForward(ids: ReadonlySet<string>): void {
    this.restack(forward(this.stacking(), ids));
  }

  sendBackward(ids: ReadonlySet<string>): void {
    this.restack(backward(this.stacking(), ids));
  }

  /** Inserts copies of `shapes` offset by (dx, dy), stacked above everything. Returns the new ids. */
  insertCopies(shapes: readonly Shape[], dx: number, dy: number): string[] {
    const ordered = [...shapes].sort(compareStacked);
    return this.createMany(
      ordered.map((shape) => {
        const { id: _id, z: _z, ...rest } = shape;
        return { ...rest, x: shape.x + dx, y: shape.y + dy };
      }),
    );
  }

  duplicate(ids: Iterable<string>, dx: number, dy: number): string[] {
    const shapes: Shape[] = [];
    for (const id of ids) {
      const shape = this.get(id);
      if (shape) shapes.push(shape);
    }
    return this.insertCopies(shapes, dx, dy);
  }

  get title(): string {
    const value = this.meta.get('title');
    return typeof value === 'string' ? value : '';
  }

  setTitle(title: string): void {
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX_LENGTH);
    if (clean === this.title) return;
    this.transact(() => this.meta.set('title', clean));
  }
}

function writeShape(map: ShapeMap, shape: Shape): void {
  map.set('kind', shape.kind);
  map.set('x', shape.x);
  map.set('y', shape.y);
  map.set('z', shape.z);
  map.set('ink', shape.ink);
  map.set('size', shape.size);
  switch (shape.kind) {
    case 'pen': {
      const points = new Y.Array<number>();
      map.set('points', points);
      points.push(encodePoints(shape.points));
      map.set('realPressure', shape.realPressure);
      map.set('sx', shape.sx);
      map.set('sy', shape.sy);
      break;
    }
    case 'rect':
    case 'ellipse':
      map.set('w', shape.w);
      map.set('h', shape.h);
      map.set('fill', shape.fill);
      break;
    case 'line':
    case 'arrow':
      map.set('dx', shape.dx);
      map.set('dy', shape.dy);
      break;
    case 'text':
      map.set('text', new Y.Text(shape.text));
      map.set('scale', shape.scale);
      break;
    case 'sticky':
      map.set('w', shape.w);
      map.set('h', shape.h);
      map.set('text', new Y.Text(shape.text));
      break;
  }
}

/**
 * Reads a shape defensively. Any client can write anything into the shared
 * document, so a malformed entry is skipped instead of crashing every
 * renderer that receives it.
 */
export function readShape(id: string, map: ShapeMap): Shape | null {
  return shapeFromFields(id, (key) => {
    const value = map.get(key);
    if (key === 'points') return decodePoints(value instanceof Y.Array ? value.toArray() : []);
    // Yjs types declare toJSON (not toString) on Y.Text; both return the plain string.
    if (value instanceof Y.Text) return value.toJSON();
    return value;
  });
}

/**
 * Validates a plain object (for example from the clipboard) with the same
 * rules as `readShape`. Pen points are expected already decoded.
 */
export function parseShape(value: unknown): Shape | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== 'string') return null;
  return shapeFromFields(id, (key) => {
    const field = record[key];
    if (key !== 'points') return field;
    return Array.isArray(field) ? field.filter((n): n is number => isFiniteNumber(n)) : [];
  });
}

function shapeFromFields(id: string, get: (key: string) => unknown): Shape | null {
  const kind = get('kind');
  const z = get('z');
  const x = get('x');
  const y = get('y');
  if (!isShapeKind(kind) || typeof z !== 'string' || !isFiniteNumber(x) || !isFiniteNumber(y)) {
    return null;
  }
  const inkValue = get('ink');
  const sizeValue = get('size');
  const common = {
    id,
    x,
    y,
    z,
    ink: isInk(inkValue) ? inkValue : 'chalk',
    size: isSize(sizeValue) ? sizeValue : 'm',
  } as const;
  switch (kind) {
    case 'pen': {
      const points = get('points');
      return {
        ...common,
        kind,
        points: Array.isArray(points) ? (points as number[]) : [],
        realPressure: get('realPressure') === true,
        sx: nonZero(get('sx')),
        sy: nonZero(get('sy')),
      };
    }
    case 'rect':
    case 'ellipse': {
      const fill = get('fill');
      return {
        ...common,
        kind,
        w: positive(get('w')),
        h: positive(get('h')),
        fill: isFill(fill) ? fill : FILLS[0],
      };
    }
    case 'line':
    case 'arrow':
      return { ...common, kind, dx: finite(get('dx')), dy: finite(get('dy')) };
    case 'text': {
      const scale = get('scale');
      return {
        ...common,
        kind,
        text: stringValue(get('text')),
        scale: isFiniteNumber(scale) && scale > 0 ? scale : 1,
      };
    }
    case 'sticky':
      return {
        ...common,
        kind,
        w: positive(get('w')),
        h: positive(get('h')),
        text: stringValue(get('text')),
      };
  }
}

/**
 * Turns `text` into `next` with one delete and one insert around the common
 * prefix and suffix. Rewriting the whole string would make two people typing
 * in the same note overwrite each other; a minimal edit lets Yjs merge them.
 * Cut points never split a UTF-16 surrogate pair.
 */
export function applyTextDiff(text: Y.Text, next: string): void {
  const prev = text.toJSON();
  if (prev === next) return;
  const max = Math.min(prev.length, next.length);
  let start = 0;
  while (start < max && prev.charCodeAt(start) === next.charCodeAt(start)) start++;
  if (start > 0 && isHighSurrogate(prev.charCodeAt(start - 1))) start--;
  let endPrev = prev.length;
  let endNext = next.length;
  while (
    endPrev > start &&
    endNext > start &&
    prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)
  ) {
    endPrev--;
    endNext--;
  }
  if (endPrev < prev.length && isLowSurrogate(prev.charCodeAt(endPrev))) {
    endPrev++;
    endNext++;
  }
  if (endPrev > start) text.delete(start, endPrev - start);
  if (endNext > start) text.insert(start, next.slice(start, endNext));
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finite(value: unknown): number {
  return isFiniteNumber(value) ? value : 0;
}

function nonZero(value: unknown): number {
  return isFiniteNumber(value) && value !== 0 ? value : 1;
}

function positive(value: unknown): number {
  return isFiniteNumber(value) && value > 0 ? value : 1;
}
