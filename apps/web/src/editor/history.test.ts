import { Board, type ShapeInit } from '@chalkline/core';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { History } from './history.ts';

/** Two clients whose docs stay in sync, like two browsers on one board. */
function connectedPair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'net') Y.applyUpdate(b, update, 'net');
  });
  b.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'net') Y.applyUpdate(a, update, 'net');
  });
  const alice = new Board(a, { who: 'alice' });
  const bob = new Board(b, { who: 'bob' });
  return { alice, bob, aliceHistory: new History(alice), bobHistory: new History(bob) };
}

const rect: ShapeInit = {
  kind: 'rect',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  fill: 'none',
  ink: 'chalk',
  size: 'm',
};

function step(history: History, fn: () => void) {
  history.cut();
  fn();
  history.cut();
}

describe('per-user undo', () => {
  it("never undoes another user's shape", () => {
    const { alice, bob, aliceHistory } = connectedPair();
    step(aliceHistory, () => alice.create(rect));
    const bobs = bob.create({ ...rect, x: 300 });
    aliceHistory.undo();
    expect(alice.list().map((s) => s.id)).toEqual([bobs]);
    expect(bob.list().map((s) => s.id)).toEqual([bobs]);
    expect(aliceHistory.manager.canUndo()).toBe(false);
  });

  it("does not clobber a collaborator's newer move when undoing my move", () => {
    const { alice, bob, aliceHistory } = connectedPair();
    const id = bob.create(rect);
    step(aliceHistory, () => alice.update(id, { x: 100 }));
    bob.update(id, { x: 250 });
    aliceHistory.undo();
    expect(alice.get(id)?.x).toBe(250);
  });

  it("keeps a collaborator's recolor when undoing my move of the same shape", () => {
    const { alice, bob, aliceHistory } = connectedPair();
    const id = bob.create(rect);
    step(aliceHistory, () => alice.update(id, { x: 100 }));
    bob.update(id, { ink: 'mint' });
    aliceHistory.undo();
    expect(alice.get(id)).toMatchObject({ x: 0, ink: 'mint' });
  });

  it('treats a whole streamed pen stroke as one step', () => {
    const { alice, aliceHistory } = connectedPair();
    aliceHistory.cut();
    const id = alice.create({
      kind: 'pen',
      x: 0,
      y: 0,
      points: [0, 0, 0.5],
      realPressure: false,
      sx: 1,
      sy: 1,
      ink: 'chalk',
      size: 'm',
    });
    for (let i = 1; i < 30; i++) alice.appendPoints(id, [i, i, 0.5]);
    aliceHistory.cut();
    aliceHistory.undo();
    expect(alice.list()).toHaveLength(0);
    aliceHistory.redo();
    const pen = alice.get(id);
    expect(pen?.kind === 'pen' && pen.points.length).toBe(90);
  });

  it('reports exactly one fresh step per gesture, for the offline change counter', () => {
    const { alice, aliceHistory } = connectedPair();
    const fresh: boolean[] = [];
    alice.doc.on('update', (_u: Uint8Array, origin: unknown) => {
      if (aliceHistory.isLocal(origin)) fresh.push(aliceHistory.takeFreshStep());
    });
    aliceHistory.cut();
    const id = alice.create(rect);
    alice.update(id, { x: 10 });
    alice.update(id, { x: 20 });
    aliceHistory.cut();
    step(aliceHistory, () => alice.update(id, { ink: 'pink' }));
    aliceHistory.undo();
    expect(fresh).toEqual([true, false, false, true, true]);
  });

  it('restores the selection that was active when the step was made', () => {
    const { alice, aliceHistory } = connectedPair();
    let selection: string[] = [];
    aliceHistory.bindSelection(
      () => selection,
      (ids) => (selection = ids),
    );
    const id = alice.create(rect);
    selection = [id];
    step(aliceHistory, () => alice.update(id, { x: 50 }));
    selection = [];
    aliceHistory.undo();
    expect(selection).toEqual([id]);
  });
});
