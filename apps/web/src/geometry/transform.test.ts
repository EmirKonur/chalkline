import type { Shape } from '@chalkline/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { geomBounds } from './bounds.ts';
import { monoMeasure } from './test-measure.ts';
import { ALL_HANDLES, resizeRect, transformShape } from './transform.ts';

const start = { x: 0, y: 0, w: 100, h: 50 };
const opts = { aspect: false, center: false, minSize: 4 };

describe('resizeRect', () => {
  it('moves only the dragged edges', () => {
    expect(resizeRect(start, 'se', { x: 150, y: 80 }, opts)).toEqual({ x: 0, y: 0, w: 150, h: 80 });
    expect(resizeRect(start, 'w', { x: -20, y: 999 }, opts)).toEqual({
      x: -20,
      y: 0,
      w: 120,
      h: 50,
    });
  });

  it('stops at the minimum size instead of flipping', () => {
    expect(resizeRect(start, 'e', { x: -500, y: 0 }, opts)).toEqual({ x: 0, y: 0, w: 4, h: 50 });
  });

  it('keeps the aspect ratio when asked', () => {
    const r = resizeRect(start, 'se', { x: 300, y: 60 }, { ...opts, aspect: true });
    expect(r.w / r.h).toBeCloseTo(2);
    expect(r.w).toBe(300);
  });

  it('resizes around the center with Alt', () => {
    expect(resizeRect(start, 'e', { x: 110, y: 0 }, { ...opts, center: true })).toEqual({
      x: -10,
      y: 0,
      w: 120,
      h: 50,
    });
  });

  it('never produces a box smaller than the minimum for any handle and pointer', () => {
    const coord = fc.double({ min: -1000, max: 1000, noNaN: true });
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_HANDLES),
        coord,
        coord,
        fc.boolean(),
        fc.boolean(),
        (handle, x, y, aspect, center) => {
          const r = resizeRect(start, handle, { x, y }, { aspect, center, minSize: 4 });
          expect(r.w).toBeGreaterThanOrEqual(4 - 1e-9);
          expect(r.h).toBeGreaterThanOrEqual(4 - 1e-9);
        },
      ),
    );
  });
});

describe('transformShape', () => {
  const common = { id: 's', z: 'a0', ink: 'chalk', size: 'm' } as const;

  it('maps a rectangle into the new frame', () => {
    const shape: Shape = { ...common, kind: 'rect', x: 50, y: 0, w: 50, h: 50, fill: 'none' };
    expect(transformShape(shape, start, { x: 0, y: 0, w: 200, h: 100 })).toEqual({
      x: 100,
      y: 0,
      w: 100,
      h: 100,
    });
  });

  it('scales pen strokes through sx/sy so the geometry lands exactly in the frame', () => {
    const pen: Shape = {
      ...common,
      kind: 'pen',
      x: 0,
      y: 0,
      points: [0, 0, 0.5, 100, 50, 0.5],
      realPressure: false,
      sx: 1,
      sy: 1,
    };
    const to = { x: 10, y: 20, w: 50, h: 100 };
    const moved = { ...pen, ...transformShape(pen, start, to) } as Shape;
    expect(geomBounds(moved, monoMeasure)).toEqual(to);
  });

  it('scales text uniformly', () => {
    const text: Shape = { ...common, kind: 'text', x: 0, y: 0, text: 'hi', scale: 1 };
    expect(transformShape(text, start, { x: 0, y: 0, w: 200, h: 100 })).toMatchObject({ scale: 2 });
  });
});
