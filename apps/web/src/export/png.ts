import type { Shape } from '@chalkline/core';
import { renderBounds } from '../geometry/bounds.ts';
import type { MeasureText } from '../geometry/text.ts';
import { expandRect, unionRects } from '../geometry/vec.ts';
import { drawShape } from '../render/draw.ts';
import { penPathData } from '../render/pen-path.ts';
import { InkStyles } from '../render/ink.ts';
import type { Palette } from '../theme/palette.ts';
import { EXPORT_PADDING } from './svg.ts';

/** Largest edge of an exported image; very large boards are scaled down to fit. */
const MAX_EDGE_PX = 8192;

/** Renders shapes to a PNG with the same drawing code the live canvas uses. */
export async function exportPng(
  shapes: readonly Shape[],
  palette: Palette,
  measure: MeasureText,
  scale = 2,
): Promise<Blob> {
  const bounds = unionRects(shapes.map((s) => renderBounds(s, measure)));
  const box = expandRect(bounds ?? { x: 0, y: 0, w: 0, h: 0 }, EXPORT_PADDING);
  const k = Math.min(scale, MAX_EDGE_PX / Math.max(box.w, box.h, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(box.w * k));
  canvas.height = Math.max(1, Math.ceil(box.h * k));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');

  ctx.setTransform(k, 0, 0, k, -box.x * k, -box.y * k);
  const inks = new InkStyles(ctx);
  const inkStyle = (color: string) => inks.style(color, palette.grain, k);
  for (const shape of shapes) {
    drawShape(ctx, shape, {
      palette,
      inkStyle,
      measure,
      zoom: k,
      penPath: shape.kind === 'pen' ? new Path2D(penPathData(shape)) : undefined,
    });
  }
  // The board color goes underneath last, so grain shows slate rather than transparency.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.board;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
