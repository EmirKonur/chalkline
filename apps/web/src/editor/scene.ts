import { compareStacked, readShape, type Board, type Shape } from '@chalkline/core';
import type * as Y from 'yjs';
import { geomBounds, renderBounds } from '../geometry/bounds.ts';
import { hitShape } from '../geometry/hit.ts';
import type { MeasureText } from '../geometry/text.ts';
import { rectsOverlap, unionRects, type Point, type Rect } from '../geometry/vec.ts';

export interface SceneEntry {
  shape: Shape;
  /** Selection box (geometry only). */
  geom: Rect;
  /** Everything painted, for culling. */
  bounds: Rect;
  /** Bumped on every change. */
  version: number;
  /** Bumped only when the shape's own geometry changes; a pure move keeps it. */
  geomVersion: number;
}

export interface SceneChange {
  changed: ReadonlySet<string>;
  removed: ReadonlySet<string>;
  /** Last known state of each removed shape. */
  removedShapes: ReadonlyMap<string, Shape>;
  /** Whether this user's own edit caused it (false for remote edits and remeasuring). */
  local: boolean;
}

/** Fields that do not change a shape's path once it is drawn at its origin. */
const PLACEMENT_KEYS = new Set(['x', 'y', 'z', 'ink']);

/**
 * A plain-object mirror of the shapes map, kept current incrementally from
 * Yjs deep-observe events. Rendering and hit-testing read this instead of
 * the Y types, which keeps per-frame work free of CRDT lookups.
 */
export class Scene {
  private readonly entries = new Map<string, SceneEntry>();
  private sorted: SceneEntry[] | null = null;
  private readonly listeners = new Set<(change: SceneChange) => void>();
  private readonly board: Board;
  private readonly measure: MeasureText;
  private readonly isLocal: (origin: unknown) => boolean;
  /** Increments on every change, for subscribers that only need to know "something changed". */
  tick = 0;

  constructor(board: Board, measure: MeasureText, isLocal: (origin: unknown) => boolean) {
    this.board = board;
    this.measure = measure;
    this.isLocal = isLocal;
    board.shapes.forEach((map, id) => {
      const shape = readShape(id, map);
      if (shape) this.entries.set(id, this.makeEntry(shape));
    });
    board.shapes.observeDeep(this.handleEvents);
  }

  get size(): number {
    return this.entries.size;
  }

  get(id: string): SceneEntry | undefined {
    return this.entries.get(id);
  }

  /** Entries in render order, bottom first. */
  ordered(): readonly SceneEntry[] {
    this.sorted ??= [...this.entries.values()].sort((a, b) => compareStacked(a.shape, b.shape));
    return this.sorted;
  }

  /** Entries whose painted area overlaps `rect`, in render order. */
  query(rect: Rect): SceneEntry[] {
    return this.ordered().filter((entry) => rectsOverlap(entry.bounds, rect));
  }

  /** Topmost shape under `p`. */
  hit(p: Point, tolerance: number): Shape | null {
    const ordered = this.ordered();
    for (let i = ordered.length - 1; i >= 0; i--) {
      const entry = ordered[i] as SceneEntry;
      if (hitShape(entry.shape, p, tolerance, this.measure)) return entry.shape;
    }
    return null;
  }

  boundsOf(ids: Iterable<string>): Rect | null {
    const rects: Rect[] = [];
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) rects.push(entry.geom);
    }
    return unionRects(rects);
  }

  contentBounds(): Rect | null {
    return unionRects([...this.entries.values()].map((entry) => entry.geom));
  }

  /** Recomputes text metrics, e.g. once the board font has loaded. */
  remeasure(): void {
    for (const entry of this.entries.values()) {
      if (entry.shape.kind !== 'text' && entry.shape.kind !== 'sticky') continue;
      entry.geom = geomBounds(entry.shape, this.measure);
      entry.bounds = renderBounds(entry.shape, this.measure);
      entry.version += 1;
      entry.geomVersion += 1;
    }
    this.emit({
      changed: new Set(this.entries.keys()),
      removed: new Set(),
      removedShapes: new Map(),
      local: false,
    });
  }

  subscribe(listener: (change: SceneChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.board.shapes.unobserveDeep(this.handleEvents);
    this.listeners.clear();
  }

  private readonly handleEvents = (
    events: Y.YEvent<Y.AbstractType<unknown>>[],
    tx: Y.Transaction,
  ) => {
    // id -> changed keys; null means "treat everything as changed".
    const touched = new Map<string, Set<string> | null>();
    for (const event of events) {
      if (event.target === this.board.shapes) {
        for (const id of (event as Y.YMapEvent<unknown>).keysChanged as Set<string>)
          touched.set(id, null);
        continue;
      }
      const id = event.path[0];
      if (typeof id !== 'string' || touched.get(id) === null) continue;
      const keys = touched.get(id) ?? new Set<string>();
      if (event.path.length > 1) keys.add(String(event.path[1]));
      else
        for (const key of (event as Y.YMapEvent<unknown>).keysChanged as Set<string>) keys.add(key);
      touched.set(id, keys);
    }

    const changed = new Set<string>();
    const removed = new Set<string>();
    const removedShapes = new Map<string, Shape>();
    let reorder = false;
    for (const [id, keys] of touched) {
      const map = this.board.shapes.get(id);
      const shape = map ? readShape(id, map) : null;
      const existing = this.entries.get(id);
      if (!shape) {
        if (existing) {
          this.entries.delete(id);
          removed.add(id);
          removedShapes.set(id, existing.shape);
          reorder = true;
        }
        continue;
      }
      if (!existing) {
        this.entries.set(id, this.makeEntry(shape));
        reorder = true;
      } else {
        if (existing.shape.z !== shape.z) reorder = true;
        const placementOnly = keys !== null && [...keys].every((key) => PLACEMENT_KEYS.has(key));
        existing.shape = shape;
        existing.geom = geomBounds(shape, this.measure);
        existing.bounds = renderBounds(shape, this.measure);
        existing.version += 1;
        if (!placementOnly) existing.geomVersion += 1;
      }
      changed.add(id);
    }
    if (changed.size === 0 && removed.size === 0) return;
    if (reorder) this.sorted = null;
    this.emit({ changed, removed, removedShapes, local: this.isLocal(tx.origin) });
  };

  private makeEntry(shape: Shape): SceneEntry {
    return {
      shape,
      geom: geomBounds(shape, this.measure),
      bounds: renderBounds(shape, this.measure),
      version: 0,
      geomVersion: 0,
    };
  }

  private emit(change: SceneChange): void {
    this.tick += 1;
    for (const listener of this.listeners) listener(change);
  }
}
