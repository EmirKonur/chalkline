import type { Shape } from '@chalkline/core';
import { fontSizeOf, renderBounds, strokeWidth } from '../geometry/bounds.ts';
import {
  BOARD_FONT,
  BOARD_FONT_WEIGHT,
  STICKY_PADDING,
  layoutSticky,
  layoutText,
  type MeasureText,
  type TextLayout,
} from '../geometry/text.ts';
import { expandRect, unionRects } from '../geometry/vec.ts';
import { TINT_ALPHA } from '../render/color.ts';
import { arrowHead, cornerRadius } from '../render/draw.ts';
import { penPathData } from '../render/pen-path.ts';
import type { Palette } from '../theme/palette.ts';

export const EXPORT_PADDING = 32;

const n = (v: number) => (Math.round(v * 100) / 100).toString();

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serializes shapes to a standalone SVG. It mirrors the canvas renderer
 * shape for shape (pen outlines come from the same perfect-freehand path),
 * minus the chalk grain, which SVG viewers would render inconsistently.
 */
export function exportSvg(
  shapes: readonly Shape[],
  palette: Palette,
  measure: MeasureText,
): string {
  const bounds = unionRects(shapes.map((s) => renderBounds(s, measure)));
  const box = expandRect(bounds ?? { x: 0, y: 0, w: 0, h: 0 }, EXPORT_PADDING);
  const body = shapes.map((shape) => shapeToSvg(shape, palette, measure)).join('\n  ');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}" width="${Math.ceil(box.w)}" height="${Math.ceil(box.h)}">`,
    `  <rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="${palette.board}"/>`,
    `  ${body}`,
    '</svg>',
    '',
  ].join('\n');
}

export function shapeToSvg(shape: Shape, palette: Palette, measure: MeasureText): string {
  const ink = palette.ink[shape.ink];
  const width = n(strokeWidth(shape));
  switch (shape.kind) {
    case 'pen':
      return `<path transform="translate(${n(shape.x)} ${n(shape.y)})" d="${penPathData(shape)}" fill="${ink}"/>`;
    case 'rect':
    case 'ellipse': {
      const fill =
        shape.fill === 'none'
          ? 'fill="none"'
          : `fill="${ink}"${shape.fill === 'tint' ? ` fill-opacity="${TINT_ALPHA}"` : ''}`;
      const stroke = `stroke="${ink}" stroke-width="${width}" stroke-linejoin="round"`;
      if (shape.kind === 'rect') {
        const r = n(cornerRadius(shape.w, shape.h));
        return `<rect x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.w)}" height="${n(shape.h)}" rx="${r}" ${fill} ${stroke}/>`;
      }
      return `<ellipse cx="${n(shape.x + shape.w / 2)}" cy="${n(shape.y + shape.h / 2)}" rx="${n(shape.w / 2)}" ry="${n(shape.h / 2)}" ${fill} ${stroke}/>`;
    }
    case 'line':
    case 'arrow': {
      const start = { x: shape.x, y: shape.y };
      const end = { x: shape.x + shape.dx, y: shape.y + shape.dy };
      let d = `M${n(start.x)},${n(start.y)}L${n(end.x)},${n(end.y)}`;
      if (shape.kind === 'arrow' && (shape.dx !== 0 || shape.dy !== 0)) {
        const [left, right] = arrowHead(end, start, strokeWidth(shape));
        d += `M${n(left.x)},${n(left.y)}L${n(end.x)},${n(end.y)}L${n(right.x)},${n(right.y)}`;
      }
      return `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case 'text':
      return textToSvg(layoutText(shape.text, fontSizeOf(shape), measure), shape.x, shape.y, ink);
    case 'sticky': {
      const { x, y, w, h } = shape;
      const layout = layoutSticky(shape.text, w, h, measure);
      return [
        `<g>`,
        `<rect x="${n(x + 1)}" y="${n(y + 4)}" width="${n(w)}" height="${n(h)}" rx="6" fill="${palette.paperShadow}"/>`,
        `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="6" fill="${palette.paper[shape.ink]}"/>`,
        `<rect x="-26" y="-7" width="52" height="14" fill="${palette.tape}" transform="translate(${n(x + w / 2)} ${n(y)}) rotate(-2.9)"/>`,
        textToSvg(layout, x + STICKY_PADDING, y + STICKY_PADDING, palette.paperText),
        `</g>`,
      ].join('');
    }
  }
}

function textToSvg(layout: TextLayout, x: number, y: number, color: string): string {
  const offset = (layout.lineHeight - layout.fontSize) / 2;
  const lines = layout.lines
    .map((line, i) =>
      line.length === 0
        ? ''
        : `<tspan x="${n(x)}" y="${n(y + i * layout.lineHeight + offset)}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  const family = BOARD_FONT.replace(/"/g, "'");
  return `<text font-family="${family}" font-weight="${BOARD_FONT_WEIGHT}" font-size="${n(layout.fontSize)}" dominant-baseline="text-before-edge" fill="${color}">${lines}</text>`;
}
