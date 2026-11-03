import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Stacking order uses fractional indexing: each shape stores a string key and
 * shapes render in ascending (key, id) order. Moving a shape rewrites one key
 * instead of reshuffling an array, which matters for CRDTs: concurrent moves
 * on a Y.Array are a delete plus an insert, and two users moving the same
 * shape would leave two copies. With keys, concurrent moves are plain
 * last-writer-wins writes to one map field.
 */

export interface Stacked {
  id: string;
  z: string;
}

/** Comparator for the render order. The id breaks ties between equal keys. */
export function compareStacked(a: Stacked, b: Stacked): number {
  if (a.z !== b.z) return a.z < b.z ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

const JITTER_DIGITS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Returns a key strictly between `a` and `b` (either may be null for an open
 * end). Two clients that both "bring to front" at the same moment would
 * compute the same key; a short random suffix keeps their keys distinct so
 * later inserts between them still have room.
 */
export function keyBetween(a: string | null, b: string | null, random = Math.random): string {
  const base = generateKeyBetween(a, b);
  const suffix =
    (JITTER_DIGITS[Math.floor(random() * JITTER_DIGITS.length)] ?? 'V') +
    (JITTER_DIGITS[Math.floor(random() * JITTER_DIGITS.length)] ?? 'V');
  const jittered = base + suffix;
  return b === null || jittered < b ? jittered : base;
}

/** Returns `n` ascending keys strictly between `a` and `b`. */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return [keyBetween(a, b)];
  return generateNKeysBetween(a, b, n);
}

/**
 * Given the current ascending order and a desired order of the same ids,
 * returns new keys only for shapes that have to change. Unmoved shapes keep
 * their key, and a moved shape keeps its key too when it already sits in a
 * valid spot, so a reorder writes as few fields as possible (fewer writes,
 * fewer chances to clobber someone else's concurrent change). Neighbors that
 * share a key, which concurrent edits can produce, are re-keyed as part of
 * the run so the result is always strictly increasing.
 */
export function rekey(
  current: readonly Stacked[],
  desired: readonly string[],
  moved: ReadonlySet<string>,
): Map<string, string> {
  const keyOf = new Map(current.map((s) => [s.id, s.z]));
  // For each position, the key of the nearest unmoved shape after it.
  const nextFixed = new Array<string | null>(desired.length);
  let upcoming: string | null = null;
  for (let i = desired.length - 1; i >= 0; i--) {
    nextFixed[i] = upcoming;
    const id = desired[i] as string;
    const key = keyOf.get(id);
    if (!moved.has(id) && key !== undefined) upcoming = key;
  }
  const canKeep = (index: number, prev: string | null): boolean => {
    const id = desired[index] as string;
    const key = keyOf.get(id);
    if (key === undefined || (prev !== null && key <= prev)) return false;
    const upper = nextFixed[index] ?? null;
    return !moved.has(id) || upper === null || key < upper;
  };

  const result = new Map<string, string>();
  let prev: string | null = null;
  let i = 0;
  while (i < desired.length) {
    if (canKeep(i, prev)) {
      prev = keyOf.get(desired[i] as string) as string;
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < desired.length && !canKeep(j, prev)) j += 1;
    const upper = j < desired.length ? (keyOf.get(desired[j] as string) as string) : null;
    const fresh = keysBetween(prev, upper, j - i);
    for (let k = i; k < j; k++) result.set(desired[k] as string, fresh[k - i] as string);
    prev = fresh.at(-1) ?? prev;
    i = j;
  }
  return result;
}

/** Moves the selected ids above everything else, preserving their relative order. */
export function toFront(
  ordered: readonly Stacked[],
  ids: ReadonlySet<string>,
): Map<string, string> {
  const rest = ordered.filter((s) => !ids.has(s.id)).map((s) => s.id);
  const picked = ordered.filter((s) => ids.has(s.id)).map((s) => s.id);
  return rekey(ordered, [...rest, ...picked], ids);
}

/** Moves the selected ids below everything else, preserving their relative order. */
export function toBack(ordered: readonly Stacked[], ids: ReadonlySet<string>): Map<string, string> {
  const rest = ordered.filter((s) => !ids.has(s.id)).map((s) => s.id);
  const picked = ordered.filter((s) => ids.has(s.id)).map((s) => s.id);
  return rekey(ordered, [...picked, ...rest], ids);
}

/** Moves each selected shape one step up, past its nearest unselected neighbor. */
export function forward(
  ordered: readonly Stacked[],
  ids: ReadonlySet<string>,
): Map<string, string> {
  const order = ordered.map((s) => s.id);
  for (let i = order.length - 2; i >= 0; i--) {
    const here = order[i] as string;
    const above = order[i + 1] as string;
    if (ids.has(here) && !ids.has(above)) {
      order[i] = above;
      order[i + 1] = here;
    }
  }
  return rekey(ordered, order, ids);
}

/** Moves each selected shape one step down, past its nearest unselected neighbor. */
export function backward(
  ordered: readonly Stacked[],
  ids: ReadonlySet<string>,
): Map<string, string> {
  const order = ordered.map((s) => s.id);
  for (let i = 1; i < order.length; i++) {
    const here = order[i] as string;
    const below = order[i - 1] as string;
    if (ids.has(here) && !ids.has(below)) {
      order[i] = below;
      order[i - 1] = here;
    }
  }
  return rekey(ordered, order, ids);
}
