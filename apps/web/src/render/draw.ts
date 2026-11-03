import type { Shape } from '@chalkline/core';
import { ARROW_HEAD, fontSizeOf, strokeWidth } from '../geometry/bounds.ts';
import {
  BOARD_FONT,
  BOARD_FONT_WEIGHT,
  STICKY_PADDING,
  layoutSticky,
  layoutText,
  type MeasureText,
  type TextLayout,
} from '../geometry/text.ts';
import type { Point } from '../geometry/vec.ts';
import type { Palette } from '../theme/palette.ts';
import { TINT_ALPHA, withAlpha } from './color.ts';

export interface DrawOptions {
  palette: Palette;
  /** Fill or stroke style for an ink color (a chalk-textured pattern, or the plain color). */
  inkStyle: (color: string) => string | CanvasPattern;
  measure: MeasureText;
  /** Current zoom, used to switch tiny text to placeholder bars. */
  zoom: number;
  /** Cached outline for pen shapes. */
  penPath?: Path2D;
  /** Skip text the user is typing in an overlay right now. */
  hideText?: boolean;
}

/** Text smaller than this on screen is drawn as bars, which is cheaper and reads the same. */
const GREEK_BELOW_PX = 3.5;
const STICKY_RADIUS = 6;

export function cornerRadius(w: number, h: number): number {
  return Math.min(10, w / 5, h / 5);
}

/** Two short strokes forming the open chevron at the end of an arrow. */
export function arrowHead(tip: Point, from: Point, width: number): [Point, Point] {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const length = Math.min(
    Math.hypot(tip.x - from.x, tip.y - from.y) * 0.6,
    8 + width * ARROW_HEAD * 0.6,
  );
  const spread = 0.5;
  return [
    { x: tip.x - Math.cos(angle - spread) * length, y: tip.y - Math.sin(angle - spread) * length },
    { x: tip.x - Math.cos(angle + spread) * length, y: tip.y - Math.sin(angle + spread) * length },
  ];
}

/** Draws one shape in world coordinates; the caller sets the camera transform. */
export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, opts: DrawOptions): void {
  const { palette } = opts;
  const color = palette.ink[shape.ink];
  const ink = opts.inkStyle(color);
  switch (shape.kind) {
    case 'pen': {
      const path = opts.penPath;
      if (!path) return;
      ctx.fillStyle = ink;
      ctx.translate(shape.x, shape.y);
      ctx.fill(path);
      ctx.translate(-shape.x, -shape.y);
      return;
    }
    case 'rect':
    case 'ellipse': {
      ctx.beginPath();
      if (shape.kind === 'rect') {
        ctx.roundRect(shape.x, shape.y, shape.w, shape.h, cornerRadius(shape.w, shape.h));
      } else {
        ctx.ellipse(
          shape.x + shape.w / 2,
          shape.y + shape.h / 2,
          shape.w / 2,
          shape.h / 2,
          0,
          0,
          Math.PI * 2,
        );
      }
      if (shape.fill !== 'none') {
        ctx.fillStyle = shape.fill === 'solid' ? ink : withAlpha(color, TINT_ALPHA);
        ctx.fill();
      }
      ctx.lineWidth = strokeWidth(shape);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ink;
      ctx.stroke();
      return;
    }
    case 'line':
    case 'arrow': {
      const start = { x: shape.x, y: shape.y };
      const end = { x: shape.x + shape.dx, y: shape.y + shape.dy };
      const width = strokeWidth(shape);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      if (shape.kind === 'arrow' && (shape.dx !== 0 || shape.dy !== 0)) {
        const [left, right] = arrowHead(end, start, width);
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(right.x, right.y);
      }
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = ink;
      ctx.stroke();
      return;
    }
    case 'text': {
      if (opts.hideText) return;
      const layout = layoutText(shape.text, fontSizeOf(shape), opts.measure);
      drawLines(ctx, layout, shape.x, shape.y, color, ink, opts);
      return;
    }
    case 'sticky': {
      const { x, y, w, h } = shape;
      ctx.fillStyle = palette.paperShadow;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 4, w, h, STICKY_RADIUS);
      ctx.fill();
      ctx.fillStyle = palette.paper[shape.ink];
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, STICKY_RADIUS);
      ctx.fill();
      drawTape(ctx, x + w / 2, y, palette.tape);
      if (opts.hideText || shape.text.length === 0) return;
      const layout = layoutSticky(shape.text, w, h, opts.measure);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      drawLines(
        ctx,
        layout,
        x + STICKY_PADDING,
        y + STICKY_PADDING,
        palette.paperText,
        palette.paperText,
        opts,
      );
      ctx.restore();
      return;
    }
  }
}

/** A strip of masking tape across the top edge of a sticky note. */
function drawTape(ctx: CanvasRenderingContext2D, cx: number, top: number, color: string): void {
  ctx.save();
  ctx.translate(cx, top);
  ctx.rotate(-0.05);
  ctx.fillStyle = color;
  ctx.fillRect(-26, -7, 52, 14);
  ctx.restore();
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  layout: TextLayout,
  x: number,
  y: number,
  color: string,
  fill: string | CanvasPattern,
  opts: DrawOptions,
): void {
  const offset = (layout.lineHeight - layout.fontSize) / 2;
  if (layout.fontSize * opts.zoom < GREEK_BELOW_PX) {
    ctx.fillStyle = withAlpha(color, 0.35);
    layout.lines.forEach((line, i) => {
      const width = opts.measure(line, layout.fontSize);
      if (width > 0)
        ctx.fillRect(x, y + i * layout.lineHeight + offset, width, layout.fontSize * 0.7);
    });
    return;
  }
  ctx.font = `${BOARD_FONT_WEIGHT} ${layout.fontSize}px ${BOARD_FONT}`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = fill;
  layout.lines.forEach((line, i) => {
    if (line.length > 0) ctx.fillText(line, x, y + i * layout.lineHeight + offset);
  });
}
