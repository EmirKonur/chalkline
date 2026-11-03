import { describe, expect, it } from 'vitest';
import { DocStore } from '../src/store.ts';

describe('DocStore', () => {
  it('keeps rows per room in insertion order', () => {
    const store = new DocStore(':memory:');
    store.append('a', new Uint8Array([1]));
    store.append('b', new Uint8Array([9]));
    store.append('a', new Uint8Array([2, 3]));
    expect(store.load('a').map((row) => [...row])).toEqual([[1], [2, 3]]);
    expect(store.stats('a')).toEqual({ rows: 2, bytes: 3 });
    store.close();
  });

  it('replaces a room log with a single snapshot without touching other rooms', () => {
    const store = new DocStore(':memory:');
    for (let i = 0; i < 5; i++) store.append('a', new Uint8Array([i]));
    store.append('b', new Uint8Array([42]));
    store.replace('a', new Uint8Array([7, 7]));
    expect(store.load('a').map((row) => [...row])).toEqual([[7, 7]]);
    expect(store.stats('b')).toEqual({ rows: 1, bytes: 1 });
    store.close();
  });

  it('reports an unknown room as empty', () => {
    const store = new DocStore(':memory:');
    expect(store.load('nope')).toEqual([]);
    expect(store.stats('nope')).toEqual({ rows: 0, bytes: 0 });
    store.close();
  });
});
