import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Board, applyTextDiff, parseShape, readShape } from '../src/board.ts';
import type { PenShape, ShapeInit } from '../src/schema.ts';

function exchange(a: Y.Doc, b: Y.Doc): void {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

function pair(): [Board, Board] {
  const a = new Board(new Y.Doc());
  const b = new Board(new Y.Doc());
  return [a, b];
}

const rect: ShapeInit = {
  kind: 'rect',
  x: 10,
  y: 20,
  w: 100,
  h: 60,
  fill: 'none',
  ink: 'sky',
  size: 'm',
};

describe('Board', () => {
  it('creates shapes that read back with the same fields', () => {
    const board = new Board(new Y.Doc());
    const id = board.create(rect);
    expect(board.get(id)).toMatchObject({ ...rect, id });
  });

  it('stacks new shapes above existing ones', () => {
    const board = new Board(new Y.Doc());
    const first = board.create(rect);
    const [second, third] = board.createMany([rect, rect]);
    expect(board.list().map((s) => s.id)).toEqual([first, second, third]);
  });

  it('skips writes for unchanged fields so idle drags add nothing to the log', () => {
    const board = new Board(new Y.Doc());
    const id = board.create(rect);
    let updates = 0;
    board.doc.on('update', () => updates++);
    board.update(id, { x: 10, y: 20 });
    expect(updates).toBe(0);
    board.update(id, { x: 11 });
    expect(updates).toBe(1);
  });

  it('ignores updates to a shape someone else deleted', () => {
    const [a, b] = pair();
    const id = a.create(rect);
    exchange(a.doc, b.doc);
    b.remove([id]);
    exchange(a.doc, b.doc);
    a.update(id, { x: 500 });
    exchange(a.doc, b.doc);
    expect(a.get(id)).toBeNull();
    expect(b.get(id)).toBeNull();
  });

  it('converges when two users move the same shape at the same time', () => {
    const [a, b] = pair();
    const id = a.create(rect);
    exchange(a.doc, b.doc);
    a.update(id, { x: 300, y: 300 });
    b.update(id, { x: -50, y: -50 });
    exchange(a.doc, b.doc);
    const fromA = a.get(id);
    const fromB = b.get(id);
    expect(fromA).toEqual(fromB);
    // x and y were written together from the same base, so one user's drop
    // point wins as a whole rather than mixing x from one and y from the other.
    expect([fromA?.x, fromA?.y]).toSatisfy(
      ([x, y]: number[]) => (x === 300 && y === 300) || (x === -50 && y === -50),
    );
  });

  it('keeps a concurrent move and a concurrent recolor', () => {
    const [a, b] = pair();
    const id = a.create(rect);
    exchange(a.doc, b.doc);
    a.update(id, { x: 40 });
    b.update(id, { ink: 'pink' });
    exchange(a.doc, b.doc);
    expect(a.get(id)).toMatchObject({ x: 40, ink: 'pink' });
  });

  it('streams pen points and decodes them relative to the origin', () => {
    const board = new Board(new Y.Doc());
    const id = board.create({
      kind: 'pen',
      x: 100,
      y: 100,
      points: [0, 0, 0.5],
      realPressure: false,
      sx: 1,
      sy: 1,
      ink: 'chalk',
      size: 'm',
    });
    board.appendPoints(id, [10, 5, 0.6, 20.25, 8, 0.7]);
    const shape = board.get(id) as PenShape;
    expect(shape.points).toEqual([0, 0, 0.5, 10, 5, 0.6, 20.25, 8, 0.7]);
  });

  it('duplicates with an offset and stacks copies on top', () => {
    const board = new Board(new Y.Doc());
    const id = board.create(rect);
    board.create({ ...rect, x: 400 });
    const [copy] = board.duplicate([id], 16, 16);
    expect(board.get(copy as string)).toMatchObject({ x: 26, y: 36, w: 100 });
    expect(board.list().at(-1)?.id).toBe(copy);
  });

  it('clamps and normalizes the board title', () => {
    const board = new Board(new Y.Doc());
    board.setTitle('   Sprint   retro \n board  ');
    expect(board.title).toBe('Sprint retro board');
    board.setTitle('x'.repeat(200));
    expect(board.title).toHaveLength(80);
  });
});

describe('readShape', () => {
  it('rejects entries without a known kind or position', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<Y.Map<unknown>>('shapes');
    const bad = new Y.Map<unknown>();
    map.set('bad', bad);
    bad.set('kind', 'hexagon');
    bad.set('x', 1);
    bad.set('y', 1);
    bad.set('z', 'a0');
    expect(readShape('bad', bad)).toBeNull();
    bad.set('kind', 'rect');
    bad.set('x', Number.NaN);
    expect(readShape('bad', bad)).toBeNull();
  });

  it('falls back to safe defaults for unknown style tokens', () => {
    const doc = new Y.Doc();
    const map = doc.getMap<Y.Map<unknown>>('shapes');
    const entry = new Y.Map<unknown>();
    map.set('s', entry);
    entry.set('kind', 'rect');
    entry.set('x', 0);
    entry.set('y', 0);
    entry.set('z', 'a0');
    entry.set('ink', '#ff00ff');
    entry.set('w', -5);
    expect(readShape('s', entry)).toMatchObject({ ink: 'chalk', size: 'm', w: 1, fill: 'none' });
  });
});

describe('applyTextDiff', () => {
  it('lets two people typing in the same note keep both edits', () => {
    const [a, b] = pair();
    const id = a.create({
      kind: 'sticky',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      text: 'ship it',
      ink: 'butter',
      size: 'm',
    });
    exchange(a.doc, b.doc);
    a.setText(id, 'ship it friday');
    b.setText(id, 'please ship it');
    exchange(a.doc, b.doc);
    expect(a.get(id)).toMatchObject({ text: 'please ship it friday' });
    expect(b.get(id)).toMatchObject({ text: 'please ship it friday' });
  });

  it('never splits a surrogate pair', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    text.insert(0, 'go \u{1F680} now');
    applyTextDiff(text, 'go \u{1F6F8} now');
    expect(text.toJSON()).toBe('go \u{1F6F8} now');
    applyTextDiff(text, 'go \u{1F6F8}\u{1F6F8} now');
    expect(text.toJSON()).toBe('go \u{1F6F8}\u{1F6F8} now');
  });

  it('handles insertions, deletions and replacements at both ends', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    for (const next of ['abc', 'xabc', 'xab', 'b', '', 'hello', 'help', 'yelp!']) {
      applyTextDiff(text, next);
      expect(text.toJSON()).toBe(next);
    }
  });
});

describe('parseShape', () => {
  it('accepts a shape that came out of the board', () => {
    const board = new Board(new Y.Doc());
    const id = board.create({ ...rect, fill: 'tint' });
    const shape = board.get(id);
    expect(parseShape(JSON.parse(JSON.stringify(shape)))).toEqual(shape);
  });

  it('rejects non-objects and drops non-numeric points', () => {
    expect(parseShape('rect')).toBeNull();
    expect(
      parseShape({ id: 'p', kind: 'pen', x: 0, y: 0, z: 'a0', points: [1, 'x', 2, 3] }),
    ).toMatchObject({
      points: [1, 2, 3],
      sx: 1,
    });
  });
});
