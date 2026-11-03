import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COORD_STEPS, decodePoints, encodePoints } from '../src/points.ts';

describe('point codec', () => {
  it('stores integers only, so Yjs can use variable-length ints', () => {
    const stored = encodePoints([10.3, -4.71, 0.5, 200.125, 3, 1]);
    expect(stored.every(Number.isInteger)).toBe(true);
  });

  it('round-trips within a quarter world unit', () => {
    const coord = fc.double({ min: -1e5, max: 1e5, noNaN: true });
    const pressure = fc.double({ min: 0, max: 1, noNaN: true });
    fc.assert(
      fc.property(fc.array(fc.tuple(coord, coord, pressure), { maxLength: 50 }), (triples) => {
        const flat = triples.flat();
        const back = decodePoints(encodePoints(flat));
        expect(back).toHaveLength(flat.length);
        for (let i = 0; i < flat.length; i += 3) {
          expect(Math.abs((back[i] as number) - (flat[i] as number))).toBeLessThanOrEqual(
            0.5 / COORD_STEPS,
          );
          expect(Math.abs((back[i + 2] as number) - (flat[i + 2] as number))).toBeLessThanOrEqual(
            0.005,
          );
        }
      }),
    );
  });

  it('clamps pressure and drops a trailing partial triple', () => {
    expect(encodePoints([1, 2, 3, 4, 5])).toEqual([4, 8, 100]);
    expect(decodePoints([4, 8, -20, 9])).toEqual([1, 2, 0]);
  });

  it('treats garbage from a misbehaving peer as zero instead of NaN', () => {
    expect(decodePoints(['x', null, 50])).toEqual([0, 0, 0.5]);
  });
});
