/**
 * Pen points are stored as fixed-point integers. Yjs encodes integers as
 * variable-length ints (1 to 3 bytes for typical coordinates) but non-integral
 * numbers as 8-byte floats, so quantizing to a quarter world unit shrinks a
 * typical stroke by roughly 4x on the wire and in the update log.
 */

/** Coordinates are stored in units of 1 / COORD_STEPS world units. */
export const COORD_STEPS = 4;
/** Pressure in [0, 1] is stored as an integer in [0, PRESSURE_STEPS]. */
export const PRESSURE_STEPS = 100;

/** Encodes flattened [x, y, pressure] triples into the stored integer form. */
export function encodePoints(points: readonly number[]): number[] {
  const out = new Array<number>(points.length);
  for (let i = 0; i + 2 < points.length; i += 3) {
    out[i] = Math.round((points[i] ?? 0) * COORD_STEPS);
    out[i + 1] = Math.round((points[i + 1] ?? 0) * COORD_STEPS);
    out[i + 2] = Math.round(clamp01(points[i + 2] ?? 0.5) * PRESSURE_STEPS);
  }
  return out.slice(0, points.length - (points.length % 3));
}

/** Decodes stored integers back into flattened [x, y, pressure] triples. */
export function decodePoints(stored: readonly unknown[]): number[] {
  const usable = stored.length - (stored.length % 3);
  const out = new Array<number>(usable);
  for (let i = 0; i < usable; i += 3) {
    out[i] = toNumber(stored[i]) / COORD_STEPS;
    out[i + 1] = toNumber(stored[i + 1]) / COORD_STEPS;
    out[i + 2] = clamp01(toNumber(stored[i + 2]) / PRESSURE_STEPS);
  }
  return out;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
