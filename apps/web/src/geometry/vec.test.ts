import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  distToSegmentSq,
  rectFromPoints,
  segmentDistanceSq,
  segmentIntersectsRect,
  segmentsIntersect,
  snapAngle,
  unionRects,
} from './vec.ts';

const p = (x: number, y: number) => ({ x, y });

describe('segments', () => {
  it('detects crossing, touching, and parallel segments', () => {
    expect(segmentsIntersect(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(10, 0), p(10, 0), p(20, 5))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(10, 0), p(0, 1), p(10, 1))).toBe(false);
    expect(segmentsIntersect(p(0, 0), p(4, 0), p(5, 0), p(9, 0))).toBe(false);
  });

  it('measures distance to the nearest point, clamped to the endpoints', () => {
    expect(distToSegmentSq(p(5, 3), p(0, 0), p(10, 0))).toBe(9);
    expect(distToSegmentSq(p(-3, 4), p(0, 0), p(10, 0))).toBe(25);
    expect(distToSegmentSq(p(1, 1), p(0, 0), p(0, 0))).toBe(2);
  });

  it('is zero between segments that cross', () => {
    expect(segmentDistanceSq(p(0, 0), p(10, 10), p(0, 10), p(10, 0))).toBe(0);
    expect(segmentDistanceSq(p(0, 0), p(10, 0), p(0, 4), p(10, 4))).toBe(16);
  });

  it('finds segments passing through a rectangle without an endpoint inside', () => {
    const r = { x: 10, y: 10, w: 10, h: 10 };
    expect(segmentIntersectsRect(p(0, 15), p(30, 15), r)).toBe(true);
    expect(segmentIntersectsRect(p(0, 0), p(30, 5), r)).toBe(false);
  });

  it('distance is symmetric', () => {
    const pt = fc.record({
      x: fc.integer({ min: -50, max: 50 }),
      y: fc.integer({ min: -50, max: 50 }),
    });
    fc.assert(
      fc.property(pt, pt, pt, pt, (a, b, c, d) => {
        expect(segmentDistanceSq(a, b, c, d)).toBeCloseTo(segmentDistanceSq(c, d, a, b), 6);
      }),
    );
  });
});

describe('rects', () => {
  it('normalizes a drag in any direction', () => {
    expect(rectFromPoints(p(10, 20), p(0, 5))).toEqual({ x: 0, y: 5, w: 10, h: 15 });
  });

  it('unions bounds and returns null for nothing', () => {
    expect(unionRects([])).toBeNull();
    expect(
      unionRects([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: 20, y: -5, w: 5, h: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, w: 25, h: 15 });
  });
});

describe('snapAngle', () => {
  it('snaps to 15 degree steps and keeps the length', () => {
    const snapped = snapAngle(p(0, 0), p(100, 8), 15);
    expect(snapped.x).toBeCloseTo(Math.hypot(100, 8));
    expect(snapped.y).toBeCloseTo(0);
  });
});
