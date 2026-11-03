import { viewportRect } from '../geometry/camera.ts';
import { handlePoint } from '../geometry/transform.ts';
import { expandRect, rectsOverlap, unionRects, type Rect } from '../geometry/vec.ts';
import type { Editor } from '../editor/editor.ts';
import type { SceneEntry } from '../editor/scene.ts';
import { ERASER_RADIUS_PX } from '../editor/tools/eraser.ts';
import { PALETTES, type Palette } from '../theme/palette.ts';
import { withAlpha } from './color.ts';
import { drawShape } from './draw.ts';
import { penPathData } from './pen-path.ts';
import { InkStyles } from './ink.ts';
import { createGridTile } from './textures.ts';

const GRID_SPACING = 32;
const HANDLE_PX = 9;
const PERF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf');

interface PathCacheEntry {
  geomVersion: number;
  path: Path2D;
}

/**
 * Draws the board on one Canvas 2D context, on demand: nothing runs until
 * something marks the frame dirty. Shapes outside the viewport are culled
 * by bounds, pen outlines are cached per geometry version (moving a stroke
 * reuses its path), and tiny text is drawn as bars.
 */
export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly editor: Editor;
  private readonly paths = new WeakMap<SceneEntry, PathCacheEntry>();
  private readonly inks: InkStyles;
  private grid: { key: string; pattern: CanvasPattern | null } = { key: '', pattern: null };
  private frame: number | null = null;
  private dpr = 1;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, editor: Editor) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available in this browser');
    this.canvas = canvas;
    this.ctx = ctx;
    this.editor = editor;
    this.inks = new InkStyles(ctx);
    editor.setRenderHook(() => this.schedule());
  }

  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.editor.setViewport(width, height);
    this.schedule();
  }

  schedule(): void {
    if (this.frame !== null || this.destroyed) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.draw();
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.editor.setRenderHook(null);
  }

  private draw(): void {
    const started = PERF ? performance.now() : 0;
    const { ctx, editor, dpr } = this;
    const { camera, viewport, theme, grid, selection } = editor.state;
    const palette = PALETTES[theme];
    const { zoom } = camera;
    const k = dpr * zoom;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (grid) this.drawGrid(palette);

    ctx.setTransform(k, 0, 0, k, -camera.x * k, -camera.y * k);
    const view = viewportRect(camera, viewport.width, viewport.height);
    const editingId = editor.editingId();
    const erasing = editor.overlay.erasing;
    const inkStyle = (color: string) => this.inks.style(color, palette.grain, k);
    let drawn = 0;
    for (const entry of editor.scene.ordered()) {
      const { bounds, shape } = entry;
      if (!rectsOverlap(bounds, view)) continue;
      if (bounds.w * zoom < 0.5 && bounds.h * zoom < 0.5) continue;
      ctx.globalAlpha = erasing.has(shape.id) ? 0.22 : 1;
      drawShape(ctx, shape, {
        palette,
        inkStyle,
        measure: editor.measure,
        zoom,
        penPath: shape.kind === 'pen' ? this.penPath(entry) : undefined,
        hideText: shape.id === editingId,
      });
      drawn++;
    }
    ctx.globalAlpha = 1;

    this.drawRemoteSelections(palette, zoom);
    this.drawHover(palette, zoom, selection);
    this.drawSelection(palette, zoom);
    this.drawMarquee(palette, zoom);
    this.drawEraser(palette, zoom);

    if (PERF) {
      performance.measure('chalkline:render', {
        start: started,
        end: performance.now(),
        detail: { drawn, total: editor.scene.size },
      });
    }
  }

  private penPath(entry: SceneEntry): Path2D {
    const cached = this.paths.get(entry);
    if (cached && cached.geomVersion === entry.geomVersion) return cached.path;
    const path = new Path2D(entry.shape.kind === 'pen' ? penPathData(entry.shape) : '');
    this.paths.set(entry, { geomVersion: entry.geomVersion, path });
    return path;
  }

  private drawGrid(palette: Palette): void {
    const { camera } = this.editor.state;
    let spacing = GRID_SPACING * camera.zoom * this.dpr;
    while (spacing < 14 * this.dpr) spacing *= 4;
    const tileSize = Math.max(4, Math.round(spacing));
    const key = `${tileSize}:${palette.grid}:${this.dpr}`;
    if (this.grid.key !== key) {
      const tile = createGridTile(tileSize, 1.1 * this.dpr, palette.grid);
      this.grid = { key, pattern: this.ctx.createPattern(tile, 'repeat') };
    }
    const pattern = this.grid.pattern;
    if (!pattern) return;
    // Integer tiles scaled to the exact spacing, so dots stay put across the whole board.
    const scale = spacing / tileSize;
    const ox = (-camera.x * camera.zoom * this.dpr) % spacing;
    const oy = (-camera.y * camera.zoom * this.dpr) % spacing;
    pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, ox - spacing / 2, oy - spacing / 2]));
    this.ctx.fillStyle = pattern;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawHover(palette: Palette, zoom: number, selection: ReadonlySet<string>): void {
    const id = this.editor.overlay.hover;
    if (!id || selection.has(id) || this.editor.state.tool !== 'select') return;
    const entry = this.editor.scene.get(id);
    if (!entry) return;
    const r = expandRect(entry.geom, 4 / zoom);
    this.ctx.strokeStyle = withAlpha(palette.selection, 0.55);
    this.ctx.lineWidth = 1.5 / zoom;
    this.ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  private drawSelection(palette: Palette, zoom: number): void {
    const { ctx, editor } = this;
    const frame = editor.selectionFrame();
    if (!frame) return;
    ctx.strokeStyle = palette.selection;
    ctx.fillStyle = palette.handleFill;
    ctx.lineWidth = 1.5 / zoom;
    if (frame.kind === 'line') {
      for (const p of [frame.start, frame.end]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, HANDLE_PX / 2 / zoom + 1 / zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      return;
    }
    if (editor.state.selection.size > 1) {
      ctx.strokeStyle = withAlpha(palette.selection, 0.45);
      ctx.lineWidth = 1 / zoom;
      for (const shape of editor.selectedShapes()) {
        const entry = editor.scene.get(shape.id);
        if (entry) ctx.strokeRect(entry.geom.x, entry.geom.y, entry.geom.w, entry.geom.h);
      }
      ctx.strokeStyle = palette.selection;
      ctx.lineWidth = 1.5 / zoom;
    }
    const r = frame.rect;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    const size = HANDLE_PX / zoom;
    for (const handle of frame.handles) {
      const p = handlePoint(r, handle);
      ctx.beginPath();
      ctx.roundRect(p.x - size / 2, p.y - size / 2, size, size, 2.5 / zoom);
      ctx.fill();
      ctx.stroke();
    }
  }

  private drawRemoteSelections(palette: Palette, zoom: number): void {
    const { ctx, editor } = this;
    for (const peer of editor.presence.peers.get().list) {
      const ids = peer.editing ? [peer.editing] : peer.selection;
      const rects: Rect[] = [];
      for (const id of ids) {
        const entry = editor.scene.get(id);
        if (entry) rects.push(expandRect(entry.geom, 5 / zoom));
      }
      if (rects.length === 0) continue;
      const color = palette.ink[peer.color];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      for (const r of rects) ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
      const union = unionRects(rects);
      if (!union) continue;
      const label = peer.editing ? `${peer.name} is writing` : peer.name;
      const fontSize = 11 / zoom;
      ctx.font = `700 ${fontSize}px "Nunito Variable", Nunito, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      const padX = 6 / zoom;
      const height = 18 / zoom;
      const width = ctx.measureText(label).width + padX * 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(union.x, union.y - height - 3 / zoom, width, height, 5 / zoom);
      ctx.fill();
      ctx.fillStyle = palette.paperText;
      ctx.fillText(label, union.x + padX, union.y - height / 2 - 3 / zoom);
    }
  }

  private drawMarquee(palette: Palette, zoom: number): void {
    const r = this.editor.overlay.marquee;
    if (!r) return;
    this.ctx.fillStyle = withAlpha(palette.selection, 0.08);
    this.ctx.fillRect(r.x, r.y, r.w, r.h);
    this.ctx.strokeStyle = withAlpha(palette.selection, 0.85);
    this.ctx.lineWidth = 1 / zoom;
    this.ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  private drawEraser(palette: Palette, zoom: number): void {
    const { overlay, state } = this.editor;
    if (state.tool !== 'eraser' || overlay.eraserTrail.length === 0) return;
    const radius = ERASER_RADIUS_PX / zoom;
    const trail = overlay.eraserTrail;
    const ink = palette.ink.chalk;
    trail.forEach((sample, i) => {
      const alpha = ((i + 1) / trail.length) * 0.18;
      this.ctx.fillStyle = withAlpha(ink, alpha);
      this.ctx.beginPath();
      this.ctx.arc(
        sample.p.x,
        sample.p.y,
        radius * (0.6 + (0.4 * (i + 1)) / trail.length),
        0,
        Math.PI * 2,
      );
      this.ctx.fill();
    });
    const head = trail.at(-1);
    if (!head) return;
    this.ctx.strokeStyle = withAlpha(ink, 0.8);
    this.ctx.lineWidth = 1.5 / zoom;
    this.ctx.beginPath();
    this.ctx.arc(head.p.x, head.p.y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }
}
