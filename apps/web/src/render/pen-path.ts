import type { PenShape } from '@chalkline/core';
import { getStroke } from 'perfect-freehand';
import { strokeWidth } from '../geometry/bounds.ts';

/**
 * Outline of a pen stroke as an SVG path, relative to the shape origin.
 * perfect-freehand turns the centerline into a filled polygon whose width
 * follows pressure (real from a stylus, or simulated from speed for mice and
 * fingers). The same string feeds Path2D on canvas and the SVG export.
 */
export function penPathData(shape: PenShape): string {
  const input: [number, number, number][] = [];
  for (let i = 0; i + 2 < shape.points.length; i += 3) {
    input.push([
      (shape.points[i] as number) * shape.sx,
      (shape.points[i + 1] as number) * shape.sy,
      shape.points[i + 2] as number,
    ]);
  }
  const outline = getStroke(input, {
    size: strokeWidth(shape),
    thinning: shape.realPressure ? 0.62 : 0.5,
    smoothing: 0.55,
    streamline: 0.42,
    simulatePressure: !shape.realPressure,
    last: true,
  });
  return outlineToPath(outline);
}

/** Smooth closed path through the outline using quadratic curves between midpoints. */
export function outlineToPath(points: number[][]): string {
  const n = points.length;
  if (n < 3) return '';
  const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
  const at = (i: number) => points[i % n] as number[];
  const first = at(0);
  const second = at(1);
  let d = `M${fmt(((first[0] as number) + (second[0] as number)) / 2)},${fmt(((first[1] as number) + (second[1] as number)) / 2)}Q`;
  for (let i = 1; i <= n; i++) {
    const p = at(i);
    const q = at(i + 1);
    d += `${fmt(p[0] as number)},${fmt(p[1] as number)} ${fmt(((p[0] as number) + (q[0] as number)) / 2)},${fmt(((p[1] as number) + (q[1] as number)) / 2)} `;
  }
  return `${d.trimEnd()}Z`;
}
