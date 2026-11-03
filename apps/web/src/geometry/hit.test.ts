import type { Shape } from '@chalkline/core';
import { describe, expect, it } from 'vitest';
import { geomBounds, renderBounds } from './bounds.ts';
import { hitShape, shapeIntersectsRect, shapeTouchesSweep } from './hit.ts';
import { monoMeasure } from './test-measure.ts';

const common = { id: 's', z: 'a0', ink: 'chalk', size: 'm' } as const;
const rect: Shape = { ...common, kind: 'rect', x: 0, y: 0, w: 100, h: 50, fill: 'none' };
const filled: Shape = { ...rect, fill: 'tint' };
const ellipse: Shape = { ...common, kind: 'ellipse', x: 0, y: 0, w: 100, h: 50, fill: 'none' };
const pen: Shape = {
  ...common,
  kind: 'pen',
  x: 10,
  y: 10,
  points: [0, 0, 0.5, 50, 0, 0.5, 50, 50, 0.5],
  realPressure: false,
  sx: 2,
  sy: 1,
};
const text: Shape = { ...common, kind: 'text', x: 0, y: 0, text: 'hello\nboard!', scale: 1 };

describe('hitShape', () => {
  it('hits an outlined rectangle only near its border', () => {
    expect(hitShape(rect, { x: 50, y: 1 }, 2, monoMeasure)).toBe(true);
    expect(hitShape(rect, { x: 50, y: 25 }, 2, monoMeasure)).toBe(false);
    expect(hitShape(filled, { x: 50, y: 25 }, 2, monoMeasure)).toBe(true);
  });

  it('hits an ellipse on its curve, not in its bounding box corners', () => {
    expect(hitShape(ellipse, { x: 100, y: 25 }, 2, monoMeasure)).toBe(true);
    expect(hitShape(ellipse, { x: 2, y: 2 }, 2, monoMeasure)).toBe(false);
  });

  it('applies pen scale when hit-testing strokes', () => {
    // The second point sits at x = 10 + 50 * 2 = 110 after scaling.
    expect(hitShape(pen, { x: 110, y: 30 }, 2, monoMeasure)).toBe(true);
    expect(hitShape(pen, { x: 60, y: 30 }, 2, monoMeasure)).toBe(false);
  });

  it('hits anywhere inside a text block', () => {
    expect(hitShape(text, { x: 10, y: 40 }, 0, monoMeasure)).toBe(true);
    expect(hitShape(text, { x: 200, y: 10 }, 0, monoMeasure)).toBe(false);
  });
});

describe('marquee', () => {
  it('selects a stroke the rectangle crosses but not one it only surrounds the bounds of', () => {
    expect(shapeIntersectsRect(pen, { x: 100, y: 20, w: 20, h: 5 }, monoMeasure)).toBe(true);
    // Inside the stroke's bounding box, but away from any segment.
    expect(shapeIntersectsRect(pen, { x: 30, y: 40, w: 10, h: 10 }, monoMeasure)).toBe(false);
  });

  it('selects anything fully enclosed', () => {
    expect(shapeIntersectsRect(ellipse, { x: -10, y: -10, w: 200, h: 200 }, monoMeasure)).toBe(
      true,
    );
  });
});

describe('eraser sweep', () => {
  it('catches a line the eraser moved across between two samples', () => {
    const line: Shape = { ...common, kind: 'line', x: 0, y: 50, dx: 100, dy: 0 };
    expect(shapeTouchesSweep(line, { x: 50, y: 0 }, { x: 50, y: 100 }, 5, monoMeasure)).toBe(true);
    expect(shapeTouchesSweep(line, { x: 150, y: 0 }, { x: 150, y: 100 }, 5, monoMeasure)).toBe(
      false,
    );
  });

  it('erases a sticky note when the sweep passes through it', () => {
    const sticky: Shape = { ...common, kind: 'sticky', x: 0, y: 0, w: 200, h: 200, text: '' };
    expect(shapeTouchesSweep(sticky, { x: 100, y: 100 }, { x: 110, y: 100 }, 4, monoMeasure)).toBe(
      true,
    );
  });
});

describe('bounds', () => {
  it('render bounds always contain geometry bounds', () => {
    for (const shape of [rect, ellipse, pen, text]) {
      const g = geomBounds(shape, monoMeasure);
      const r = renderBounds(shape, monoMeasure);
      expect(r.x).toBeLessThanOrEqual(g.x);
      expect(r.y).toBeLessThanOrEqual(g.y);
      expect(r.x + r.w).toBeGreaterThanOrEqual(g.x + g.w);
      expect(r.y + r.h).toBeGreaterThanOrEqual(g.y + g.h);
    }
  });
});
