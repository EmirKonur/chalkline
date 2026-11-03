import { GRAIN_TILE, createGrainTile } from './textures.ts';

/**
 * Chalk texture as a fill style. Each ink color gets a tile that is the solid
 * color with grain knocked out of it, used as a repeating pattern for strokes
 * and text. Doing it per shape (rather than one grain pass over the whole
 * canvas) keeps sticky-note paper clean and respects stacking order.
 */
export class InkStyles {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly patterns = new Map<string, CanvasPattern>();
  private grain: HTMLCanvasElement | null = null;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /**
   * Style for `color` at `grain` strength. `deviceScale` is the current
   * world-to-device scale, so one grain texel stays one device pixel at any zoom.
   */
  style(color: string, grain: number, deviceScale: number): string | CanvasPattern {
    if (grain <= 0) return color;
    const key = `${color}|${grain}`;
    let pattern = this.patterns.get(key);
    if (!pattern) {
      const created = this.ctx.createPattern(this.tile(color, grain), 'repeat');
      if (!created) return color;
      pattern = created;
      this.patterns.set(key, pattern);
    }
    const s = 1 / deviceScale;
    pattern.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    return pattern;
  }

  private tile(color: string, grain: number): HTMLCanvasElement {
    this.grain ??= createGrainTile();
    const canvas = document.createElement('canvas');
    canvas.width = GRAIN_TILE;
    canvas.height = GRAIN_TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, GRAIN_TILE, GRAIN_TILE);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = grain;
    ctx.drawImage(this.grain, 0, 0);
    return canvas;
  }
}
