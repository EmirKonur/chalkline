import type { Board, Shape, ShapePatch } from '@chalkline/core';
import { geomBounds } from '../geometry/bounds.ts';
import {
  centerOn,
  fitCamera,
  lerpCamera,
  panBy,
  screenToWorld,
  stepZoom,
  zoomAt,
  type Camera,
} from '../geometry/camera.ts';
import type { MeasureText } from '../geometry/text.ts';
import { ALL_HANDLES, CORNER_HANDLES, handlePoint, type Handle } from '../geometry/transform.ts';
import { expandRect, unionRects, type Point, type Rect } from '../geometry/vec.ts';
import { classifyWheel, type WheelLike } from '../geometry/wheel.ts';
import { createStore, type Store } from '../lib/store.ts';
import type { ThemeName } from '../theme/palette.ts';
import { parseClipboard, serializeShapes } from './clipboard.ts';
import type { History } from './history.ts';
import type { Peer, Presence } from './presence.ts';
import type { Scene, SceneChange } from './scene.ts';
import {
  EMPTY_SELECTION,
  initialEditorState,
  type EditorState,
  type StyleState,
  type ToolId,
} from './state.ts';
import { EraserTool } from './tools/eraser.ts';
import { HandTool } from './tools/hand.ts';
import { PenTool } from './tools/pen.ts';
import { StickyTool, TextTool } from './tools/place.ts';
import { SelectTool } from './tools/select.ts';
import { BoxTool, LineTool } from './tools/shape.ts';
import type { BoardPointer, Tool } from './tools/tool.ts';

export interface Toast {
  message: string;
  action?: { label: string; run: () => void };
}

/** Transient things the renderer draws that are not part of the document. */
export interface Overlay {
  marquee: Rect | null;
  eraserTrail: { p: Point; t: number }[];
  erasing: Set<string>;
  hover: string | null;
}

export type SelectionFrame =
  | { kind: 'box'; rect: Rect; handles: readonly Handle[] }
  | { kind: 'line'; id: string; start: Point; end: Point };

export type HandleHit =
  { kind: 'box'; handle: Handle } | { kind: 'line'; id: string; end: 'start' | 'end' };

export interface EditorDeps {
  board: Board;
  history: History;
  scene: Scene;
  presence: Presence;
  measure: MeasureText;
  theme: ThemeName;
  notify: (toast: Toast) => void;
  reducedMotion: () => boolean;
}

type Active =
  | { kind: 'tool'; pointerId: number }
  | { kind: 'pan'; pointerId: number; last: Point }
  | { kind: 'pinch'; distance: number; center: Point };

const HANDLE_HIT_PX = 10;
/** Gap between the selection outline and the shapes, in screen pixels. */
export const FRAME_GAP_PX = 6;
const HIT_TOLERANCE_PX = 6;
const FIT_PADDING_PX = 96;
const TYPING_PAUSE_MS = 1200;
const PASTE_OFFSET = 24;
const NUDGE = 1;
const NUDGE_FAR = 10;

/**
 * The editing model behind the canvas: tools, camera, selection, text
 * editing and clipboard. It owns no DOM; the canvas view feeds it pointer
 * events and the renderer reads from it.
 */
export class Editor {
  readonly board: Board;
  readonly history: History;
  readonly scene: Scene;
  readonly presence: Presence;
  readonly measure: MeasureText;
  readonly store: Store<EditorState>;
  readonly overlay: Overlay = { marquee: null, eraserTrail: [], erasing: new Set(), hover: null };
  /** Last pointer position over the canvas, for paste placement. */
  readonly pointer = { world: { x: 0, y: 0 }, inside: false };

  private readonly tools: Record<ToolId, Tool>;
  private readonly notifyFn: (toast: Toast) => void;
  private readonly reducedMotion: () => boolean;
  private readonly touches = new Map<number, Point>();
  private readonly unsubscribe: (() => void)[] = [];
  private active: Active | null = null;
  private renderHook: (() => void) | null = null;
  private cameraAnimation: number | null = null;
  /** Where the running camera animation ends, so repeated zoom steps chain. */
  private cameraTarget: Camera | null = null;
  private lastTyping = 0;
  private pasteCount = 0;

  constructor(deps: EditorDeps) {
    this.board = deps.board;
    this.history = deps.history;
    this.scene = deps.scene;
    this.presence = deps.presence;
    this.measure = deps.measure;
    this.notifyFn = deps.notify;
    this.reducedMotion = deps.reducedMotion;
    this.store = createStore(initialEditorState(deps.theme));
    this.tools = {
      select: new SelectTool(this),
      hand: new HandTool(),
      pen: new PenTool(this),
      eraser: new EraserTool(this),
      rect: new BoxTool(this, 'rect'),
      ellipse: new BoxTool(this, 'ellipse'),
      line: new LineTool(this, 'line'),
      arrow: new LineTool(this, 'arrow'),
      text: new TextTool(this),
      sticky: new StickyTool(this),
    };
    this.store.set({ cursor: this.tools.pen.cursor });

    let lastSelection = this.state.selection;
    let lastEditing = this.editingId();
    this.unsubscribe.push(
      this.scene.subscribe(this.handleSceneChange),
      this.presence.peers.subscribe(() => this.requestRender()),
      this.store.subscribe(() => {
        const { selection } = this.state;
        if (selection !== lastSelection) {
          lastSelection = selection;
          this.presence.setSelection(selection);
        }
        const editing = this.editingId();
        if (editing !== lastEditing) {
          lastEditing = editing;
          this.presence.setEditing(editing);
        }
        this.requestRender();
      }),
    );
  }

  get state(): EditorState {
    return this.store.get();
  }

  get camera(): Camera {
    return this.state.camera;
  }

  notify(toast: Toast): void {
    this.notifyFn(toast);
  }

  // Rendering

  setRenderHook(hook: (() => void) | null): void {
    this.renderHook = hook;
  }

  requestRender(): void {
    this.renderHook?.();
  }

  // Camera

  setViewport(width: number, height: number): void {
    const { viewport } = this.state;
    if (viewport.width !== width || viewport.height !== height) {
      this.store.set({ viewport: { width, height } });
    }
  }

  setCamera(camera: Camera): void {
    this.store.set({ camera });
  }

  panBy(dx: number, dy: number): void {
    this.stopCameraAnimation();
    this.setCamera(panBy(this.camera, dx, dy));
  }

  zoomBy(factor: number, anchor?: Point): void {
    this.stopCameraAnimation();
    this.setCamera(zoomAt(this.camera, anchor ?? this.viewportCenter(), this.camera.zoom * factor));
  }

  zoomStep(direction: 1 | -1): void {
    const from = this.cameraTarget ?? this.camera;
    this.animateCamera(zoomAt(from, this.viewportCenter(), stepZoom(from.zoom, direction)));
  }

  resetZoom(): void {
    this.animateCamera(zoomAt(this.camera, this.viewportCenter(), 1));
  }

  /** Fits the selection if there is one, otherwise everything on the board. */
  zoomToFit(animate = true): void {
    const { width, height } = this.state.viewport;
    if (width === 0 || height === 0) return;
    const selected = this.selectionBounds();
    const bounds = selected ?? this.scene.contentBounds();
    const target = bounds
      ? fitCamera(bounds, width, height, FIT_PADDING_PX, selected ? 2 : 1)
      : centerOn({ x: 0, y: 0 }, width, height, 1);
    if (animate) this.animateCamera(target);
    else this.setCamera(target);
  }

  /** Pans to a collaborator's cursor. */
  jumpTo(peer: Peer): void {
    if (!peer.cursor) return;
    const { width, height } = this.state.viewport;
    this.animateCamera(centerOn(peer.cursor, width, height, this.camera.zoom));
  }

  wheel(event: WheelLike, anchor: Point): void {
    const intent = classifyWheel(event);
    if (intent.kind === 'zoom') this.zoomBy(intent.factor, anchor);
    else this.panBy(intent.dx, intent.dy);
  }

  animateCamera(target: Camera): void {
    this.stopCameraAnimation();
    if (this.reducedMotion()) {
      this.setCamera(target);
      return;
    }
    const from = this.camera;
    const started = performance.now();
    const duration = 260;
    this.cameraTarget = target;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - t) ** 3;
      this.setCamera(lerpCamera(from, target, eased));
      this.cameraAnimation = t < 1 ? requestAnimationFrame(step) : null;
      if (t >= 1) this.cameraTarget = null;
    };
    this.cameraAnimation = requestAnimationFrame(step);
  }

  /** Pointer hit tolerance in world units. */
  tolerance(): number {
    return HIT_TOLERANCE_PX / this.camera.zoom;
  }

  // Selection

  select(ids: Iterable<string>): void {
    const next = new Set<string>();
    for (const id of ids) if (this.scene.get(id)) next.add(id);
    const current = this.state.selection;
    if (next.size === current.size && [...next].every((id) => current.has(id))) return;
    const first = next.values().next().value;
    const shape = first ? this.scene.get(first)?.shape : undefined;
    const style: StyleState = shape
      ? {
          ink: shape.ink,
          size: shape.size,
          fill:
            shape.kind === 'rect' || shape.kind === 'ellipse' ? shape.fill : this.state.style.fill,
        }
      : this.state.style;
    this.store.set({ selection: next.size === 0 ? EMPTY_SELECTION : next, style });
  }

  selectAll(): void {
    this.setTool('select');
    this.select(this.scene.ordered().map((entry) => entry.shape.id));
  }

  selectedShapes(): Shape[] {
    const out: Shape[] = [];
    for (const id of this.state.selection) {
      const shape = this.scene.get(id)?.shape;
      if (shape) out.push(shape);
    }
    return out;
  }

  selectionBounds(): Rect | null {
    return this.scene.boundsOf(this.state.selection);
  }

  selectionFrame(): SelectionFrame | null {
    if (this.state.editing) return null;
    const shapes = this.selectedShapes();
    const only = shapes.length === 1 ? shapes[0] : undefined;
    if (only && (only.kind === 'line' || only.kind === 'arrow')) {
      return {
        kind: 'line',
        id: only.id,
        start: { x: only.x, y: only.y },
        end: { x: only.x + only.dx, y: only.y + only.dy },
      };
    }
    const bounds = this.selectionBounds();
    if (!bounds) return null;
    return {
      kind: 'box',
      rect: expandRect(bounds, FRAME_GAP_PX / this.camera.zoom),
      handles: shapes.some((s) => s.kind === 'text') ? CORNER_HANDLES : ALL_HANDLES,
    };
  }

  handleAt(screen: Point): HandleHit | null {
    if (this.state.tool !== 'select') return null;
    const frame = this.selectionFrame();
    if (!frame) return null;
    const world = screenToWorld(this.camera, screen);
    const reach = HANDLE_HIT_PX / this.camera.zoom;
    const near = (p: Point) => Math.hypot(p.x - world.x, p.y - world.y) <= reach;
    if (frame.kind === 'line') {
      if (near(frame.end)) return { kind: 'line', id: frame.id, end: 'end' };
      if (near(frame.start)) return { kind: 'line', id: frame.id, end: 'start' };
      return null;
    }
    for (const handle of frame.handles) {
      if (near(handlePoint(frame.rect, handle))) return { kind: 'box', handle };
    }
    return null;
  }

  setHover(id: string | null, cursor: string): void {
    if (this.overlay.hover !== id) {
      this.overlay.hover = id;
      this.requestRender();
    }
    this.store.set({ cursor });
  }

  // Tools and style

  setTool(tool: ToolId): void {
    this.cancelGesture();
    this.finishEditing();
    this.overlay.hover = null;
    this.overlay.eraserTrail = [];
    this.store.set({ tool, cursor: this.tools[tool].cursor });
    if (tool !== 'select') this.select([]);
  }

  /** Called by creation tools once a shape is placed: select it and return to the select tool. */
  finishCreating(id: string): void {
    this.setTool('select');
    this.select([id]);
  }

  setStyle(patch: Partial<StyleState>): void {
    this.store.set({ style: { ...this.state.style, ...patch } });
    const shapes = this.selectedShapes();
    if (shapes.length === 0) return;
    const patches = new Map<string, ShapePatch>();
    for (const shape of shapes) {
      const next: ShapePatch = {};
      if (patch.ink) next.ink = patch.ink;
      if (patch.size) next.size = patch.size;
      if (patch.fill && (shape.kind === 'rect' || shape.kind === 'ellipse')) next.fill = patch.fill;
      patches.set(shape.id, next);
    }
    this.change(() => this.board.updateMany(patches));
  }

  setTheme(theme: ThemeName): void {
    this.store.set({ theme });
  }

  toggleGrid(): void {
    this.store.set({ grid: !this.state.grid });
  }

  setSpacePan(held: boolean): void {
    if (this.state.spacePan === held) return;
    const cursor = held ? 'grab' : this.tools[this.state.tool].cursor;
    this.store.set({ spacePan: held, cursor });
  }

  // Discrete actions. Each is one undo step.

  /** Runs `fn` as its own undo step. */
  change<T>(fn: () => T): T {
    this.history.cut();
    let result: T | undefined;
    this.board.transact(() => {
      result = fn();
    });
    this.history.cut();
    return result as T;
  }

  deleteSelection(): void {
    const ids = [...this.state.selection];
    if (ids.length === 0) return;
    this.change(() => this.board.remove(ids));
    this.select([]);
  }

  duplicateSelection(): void {
    const ids = [...this.state.selection];
    if (ids.length === 0) return;
    this.select(this.change(() => this.board.duplicate(ids, 16, 16)));
  }

  arrange(op: 'front' | 'back' | 'forward' | 'backward'): void {
    const ids = this.state.selection;
    if (ids.size === 0) return;
    this.change(() => {
      if (op === 'front') this.board.bringToFront(ids);
      else if (op === 'back') this.board.sendToBack(ids);
      else if (op === 'forward') this.board.bringForward(ids);
      else this.board.sendBackward(ids);
    });
  }

  nudge(dx: number, dy: number, far: boolean): void {
    const step = far ? NUDGE_FAR : NUDGE;
    const patches = new Map<string, ShapePatch>();
    for (const shape of this.selectedShapes()) {
      patches.set(shape.id, { x: shape.x + dx * step, y: shape.y + dy * step });
    }
    if (patches.size > 0) this.change(() => this.board.updateMany(patches));
  }

  undo(): void {
    this.cancelGesture();
    this.history.undo();
  }

  redo(): void {
    this.cancelGesture();
    this.history.redo();
  }

  // Clipboard

  copySelection(): string | null {
    const shapes = this.selectedShapes();
    if (shapes.length === 0) return null;
    this.pasteCount = 0;
    return serializeShapes(shapes);
  }

  cutSelection(): string | null {
    const data = this.copySelection();
    if (data) this.deleteSelection();
    return data;
  }

  paste(custom: string, plain: string): void {
    const pasted = parseClipboard(custom, plain);
    if (!pasted) return;
    const at = this.pointer.inside
      ? this.pointer.world
      : screenToWorld(this.camera, this.viewportCenter());
    this.setTool('select');
    if (pasted.kind === 'text') {
      const { ink, size } = this.state.style;
      const id = this.change(() =>
        this.board.create({
          kind: 'text',
          x: at.x,
          y: at.y,
          text: pasted.text,
          scale: 1,
          ink,
          size,
        }),
      );
      this.select([id]);
      return;
    }
    const bounds = unionRects(pasted.shapes.map((s) => geomBounds(s, this.measure)));
    let dx = 0;
    let dy = 0;
    if (this.pointer.inside && bounds) {
      dx = at.x - (bounds.x + bounds.w / 2);
      dy = at.y - (bounds.y + bounds.h / 2);
    } else {
      this.pasteCount += 1;
      dx = dy = PASTE_OFFSET * this.pasteCount;
    }
    this.select(this.change(() => this.board.insertCopies(pasted.shapes, dx, dy)));
  }

  // Text editing

  editingId(): string | null {
    const editing = this.state.editing;
    return editing?.kind === 'shape' ? editing.id : null;
  }

  startEditing(id: string): void {
    const shape = this.scene.get(id)?.shape;
    if (!shape || (shape.kind !== 'text' && shape.kind !== 'sticky')) return;
    this.finishEditing();
    if (this.state.tool !== 'select') this.store.set({ tool: 'select', cursor: 'default' });
    this.history.cut();
    this.lastTyping = 0;
    this.store.set({
      editing: { kind: 'shape', id },
      editSession: this.state.editSession + 1,
      selection: new Set([id]),
    });
  }

  startDraft(at: Point): void {
    this.finishEditing();
    this.store.set({ tool: 'select', cursor: 'default', selection: EMPTY_SELECTION });
    this.history.cut();
    this.lastTyping = 0;
    this.store.set({ editing: { kind: 'draft', at }, editSession: this.state.editSession + 1 });
  }

  /** Applies the editor's text. A pause in typing starts a new undo step. */
  updateEditingText(value: string): void {
    const editing = this.state.editing;
    if (!editing) return;
    const now = performance.now();
    if (now - this.lastTyping > TYPING_PAUSE_MS) this.history.cut();
    this.lastTyping = now;
    if (editing.kind === 'shape') {
      this.board.setText(editing.id, value);
      return;
    }
    if (value.length === 0) return;
    const { ink, size } = this.state.style;
    const id = this.board.create({
      kind: 'text',
      x: editing.at.x,
      y: editing.at.y,
      text: value,
      scale: 1,
      ink,
      size,
    });
    this.store.set({ editing: { kind: 'shape', id } });
  }

  finishEditing(): void {
    const editing = this.state.editing;
    if (!editing) return;
    this.store.set({ editing: null });
    if (editing.kind === 'shape') {
      const shape = this.scene.get(editing.id)?.shape;
      if (shape?.kind === 'text' && shape.text.trim() === '') {
        this.board.remove([editing.id]);
        this.select([]);
      } else if (shape) {
        this.select([editing.id]);
      }
    }
    this.history.cut();
  }

  // Input

  pointerDown(p: BoardPointer): void {
    this.trackPointer(p);
    this.finishEditing();
    if (p.pointerType === 'touch') {
      this.touches.set(p.id, p.screen);
      if (this.touches.size === 2) {
        this.cancelGesture();
        this.active = { kind: 'pinch', ...this.pinchMetrics() };
        return;
      }
      if (this.touches.size > 2) return;
    }
    if (this.active) return;
    this.stopCameraAnimation();
    const { tool, spacePan } = this.state;
    if (p.button === 1 || spacePan || tool === 'hand') {
      this.active = { kind: 'pan', pointerId: p.id, last: p.screen };
      this.store.set({ cursor: 'grabbing', pointerActive: true });
      return;
    }
    if (p.button !== 0) return;
    this.active = { kind: 'tool', pointerId: p.id };
    this.store.set({ pointerActive: true });
    this.tools[tool].down(p);
  }

  pointerMove(p: BoardPointer): void {
    this.trackPointer(p);
    const active = this.active;
    if (p.pointerType === 'touch' && this.touches.has(p.id)) this.touches.set(p.id, p.screen);
    if (active?.kind === 'pinch') {
      const next = this.pinchMetrics();
      const zoomed = zoomAt(
        this.camera,
        next.center,
        this.camera.zoom * (next.distance / active.distance),
      );
      this.setCamera(
        panBy(zoomed, next.center.x - active.center.x, next.center.y - active.center.y),
      );
      this.active = { kind: 'pinch', ...next };
      return;
    }
    if (!active) {
      this.tools[this.state.tool].hover?.(p);
      return;
    }
    if (active.pointerId !== p.id) return;
    if (active.kind === 'pan') {
      this.panBy(p.screen.x - active.last.x, p.screen.y - active.last.y);
      active.last = p.screen;
      return;
    }
    this.tools[this.state.tool].move(p);
  }

  pointerUp(p: BoardPointer): void {
    this.touches.delete(p.id);
    const active = this.active;
    if (active?.kind === 'pinch') {
      if (this.touches.size < 2) this.active = null;
      return;
    }
    if (!active || active.pointerId !== p.id) return;
    this.active = null;
    this.store.set({ pointerActive: false });
    if (active.kind === 'pan') {
      this.store.set({ cursor: this.state.spacePan ? 'grab' : this.tools[this.state.tool].cursor });
      return;
    }
    this.tools[this.state.tool].up(p);
  }

  pointerLeave(): void {
    this.pointer.inside = false;
    this.presence.setCursor(null);
    this.overlay.eraserTrail = [];
    if (this.overlay.hover) this.overlay.hover = null;
    this.requestRender();
  }

  /** Abandons the gesture in progress, restoring anything it changed. */
  cancelGesture(): void {
    const active = this.active;
    this.active = null;
    this.touches.clear();
    if (active) this.store.set({ pointerActive: false });
    if (active?.kind === 'tool') this.tools[this.state.tool].cancel();
  }

  /** Escape: stop typing, then abandon a gesture, then clear the selection, then drop the tool. */
  escape(): void {
    if (this.state.editing) this.finishEditing();
    else if (this.active) this.cancelGesture();
    else if (this.state.selection.size > 0) this.select([]);
    else if (this.state.tool !== 'select') this.setTool('select');
  }

  destroy(): void {
    this.stopCameraAnimation();
    for (const off of this.unsubscribe) off();
    this.renderHook = null;
  }

  private trackPointer(p: BoardPointer): void {
    this.pointer.world = p.world;
    this.pointer.inside = true;
    this.presence.setCursor(p.world);
  }

  private viewportCenter(): Point {
    const { width, height } = this.state.viewport;
    return { x: width / 2, y: height / 2 };
  }

  private pinchMetrics(): { distance: number; center: Point } {
    const [a, b] = [...this.touches.values()];
    if (!a || !b) return { distance: 1, center: { x: 0, y: 0 } };
    return {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  private stopCameraAnimation(): void {
    if (this.cameraAnimation !== null) cancelAnimationFrame(this.cameraAnimation);
    this.cameraAnimation = null;
    this.cameraTarget = null;
  }

  private readonly handleSceneChange = (change: SceneChange): void => {
    if (change.removed.size > 0) {
      const { selection } = this.state;
      if ([...change.removed].some((id) => selection.has(id))) {
        this.select([...selection].filter((id) => !change.removed.has(id)));
      }
      if (!change.local) {
        this.tools[this.state.tool].removed?.(change.removed);
        const editing = this.state.editing;
        if (editing?.kind === 'shape' && change.removed.has(editing.id)) {
          this.handleEditedShapeDeleted(change.removedShapes.get(editing.id));
        }
      }
    }
    this.requestRender();
  };

  /**
   * Someone deleted the note this user is typing in. Their delete wins (it
   * is the newer intent and we cannot know it was a mistake), but the text
   * typed so far is kept in the toast so it can be put back as a new shape.
   */
  private handleEditedShapeDeleted(shape: Shape | undefined): void {
    this.store.set({ editing: null });
    this.history.cut();
    if (!shape) return;
    this.notify({
      message:
        shape.kind === 'sticky'
          ? 'Someone deleted the note you were writing on.'
          : 'Someone deleted the text you were editing.',
      action: {
        label: 'Restore it',
        run: () => {
          const { id: _id, z: _z, ...rest } = shape;
          const restored = this.change(() => this.board.create(rest));
          this.startEditing(restored);
        },
      },
    });
  }
}
