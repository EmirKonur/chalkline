import fc from 'fast-check';
import { generateKeyBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';
import {
  backward,
  compareStacked,
  forward,
  keyBetween,
  rekey,
  toBack,
  toFront,
  type Stacked,
} from '../src/zorder.ts';

function stack(ids: string[]): Stacked[] {
  const out: Stacked[] = [];
  let prev: string | null = null;
  for (const id of ids) {
    prev = generateKeyBetween(prev, null);
    out.push({ id, z: prev });
  }
  return out;
}

function apply(current: Stacked[], keys: Map<string, string>): string[] {
  return current
    .map((s) => ({ id: s.id, z: keys.get(s.id) ?? s.z }))
    .sort(compareStacked)
    .map((s) => s.id);
}

describe('keyBetween', () => {
  // Builds realistic key sets by inserting into random gaps, which produces
  // both short integer keys and deep fractional ones.
  const keySets = fc.array(fc.nat(), { minLength: 1, maxLength: 60 }).map((gaps) => {
    const keys: string[] = [];
    for (const gap of gaps) {
      const i = gap % (keys.length + 1);
      keys.splice(i, 0, generateKeyBetween(keys[i - 1] ?? null, keys[i] ?? null));
    }
    return keys;
  });

  it('always lands strictly between its bounds', () => {
    fc.assert(
      fc.property(keySets, fc.nat(), (keys, pick) => {
        const i = pick % (keys.length + 1);
        const a = keys[i - 1] ?? null;
        const b = keys[i] ?? null;
        const k = keyBetween(a, b);
        expect(a === null || k > a).toBe(true);
        expect(b === null || k < b).toBe(true);
      }),
    );
  });

  it('gives two clients bringing different shapes to front different keys', () => {
    const top = 'a3';
    let seed = 0.1;
    const alice = keyBetween(top, null, () => (seed = (seed * 7.3) % 1));
    const bob = keyBetween(top, null, () => (seed = (seed * 3.1 + 0.37) % 1));
    expect(alice).not.toEqual(bob);
    expect(alice > top && bob > top).toBe(true);
  });
});

describe('reordering', () => {
  const ordered = stack(['a', 'b', 'c', 'd', 'e']);

  it('brings a selection to the front, keeping its internal order', () => {
    const keys = toFront(ordered, new Set(['b', 'd']));
    expect(apply(ordered, keys)).toEqual(['a', 'c', 'e', 'b', 'd']);
    expect([...keys.keys()].sort()).toEqual(['b', 'd']);
  });

  it('sends a selection to the back', () => {
    expect(apply(ordered, toBack(ordered, new Set(['c', 'e'])))).toEqual(['c', 'e', 'a', 'b', 'd']);
  });

  it('moves a contiguous group forward and backward by one step', () => {
    expect(apply(ordered, forward(ordered, new Set(['b', 'c'])))).toEqual([
      'a',
      'd',
      'b',
      'c',
      'e',
    ]);
    expect(apply(ordered, backward(ordered, new Set(['c', 'd'])))).toEqual([
      'a',
      'c',
      'd',
      'b',
      'e',
    ]);
  });

  it('is a no-op for a shape already on top', () => {
    expect(forward(ordered, new Set(['e'])).size).toBe(0);
    expect(toFront(ordered, new Set(['e'])).size).toBe(0);
  });

  it('heals duplicate keys left by concurrent edits', () => {
    const dupes: Stacked[] = [
      { id: 'a', z: 'a1' },
      { id: 'b', z: 'a2' },
      { id: 'c', z: 'a2' },
      { id: 'd', z: 'a3' },
    ];
    const keys = rekey(dupes, ['a', 'c', 'b', 'd'], new Set(['c']));
    const result = apply(dupes, keys);
    expect(result).toEqual(['a', 'c', 'b', 'd']);
    const finalKeys = result.map((id) => keys.get(id) ?? dupes.find((s) => s.id === id)?.z);
    expect(new Set(finalKeys).size).toBe(4);
  });

  it('produces the desired order for any permutation of moved shapes', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 30 }), { minLength: 1, maxLength: 20 }),
        fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
        (ids, flags) => {
          const names = ids.map(String);
          const current = stack(names);
          const moved = new Set(names.filter((_, i) => flags[i]));
          const rest = names.filter((n) => !moved.has(n));
          const picked = names.filter((n) => moved.has(n)).reverse();
          const desired = [...picked.slice(0, 1), ...rest, ...picked.slice(1)];
          expect(apply(current, rekey(current, desired, moved))).toEqual(desired);
        },
      ),
    );
  });
});
