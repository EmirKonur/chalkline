import { Board, type ShapeInit } from '@chalkline/core';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { monoMeasure } from '../geometry/test-measure.ts';
import { Scene, type SceneChange } from './scene.ts';

function setup() {
  const board = new Board(new Y.Doc());
  const scene = new Scene(board, monoMeasure, (origin) => origin === board.origin);
  const changes: SceneChange[] = [];
  scene.subscribe((change) => changes.push(change));
  return { board, scene, changes };
}

const rect: ShapeInit = {
  kind: 'rect',
  x: 0,
  y: 0,
  w: 100,
  h: 60,
  fill: 'none',
  ink: 'chalk',
  size: 'm',
};
const pen: ShapeInit = {
  kind: 'pen',
  x: 0,
  y: 0,
  points: [0, 0, 0.5, 40, 40, 0.5],
  realPressure: false,
  sx: 1,
  sy: 1,
  ink: 'chalk',
  size: 'm',
};

describe('Scene', () => {
  it('mirrors creates, edits, and deletes incrementally', () => {
    const { board, scene, changes } = setup();
    const id = board.create(rect);
    expect(scene.get(id)?.shape).toMatchObject({ w: 100 });
    board.update(id, { w: 300 });
    expect(scene.get(id)?.geom.w).toBe(300);
    board.remove([id]);
    expect(scene.size).toBe(0);
    expect(changes.at(-1)?.removed.has(id)).toBe(true);
    expect(changes.at(-1)?.removedShapes.get(id)).toMatchObject({ w: 300 });
  });

  it('keeps the cached path version when a stroke only moves', () => {
    const { board, scene } = setup();
    const id = board.create(pen);
    const entry = scene.get(id);
    const geomVersion = entry?.geomVersion;
    board.update(id, { x: 500, y: 20 });
    expect(entry?.geomVersion).toBe(geomVersion);
    expect(entry?.geom.x).toBe(500);
    board.appendPoints(id, [80, 0, 0.5]);
    expect(entry?.geomVersion).toBe((geomVersion ?? 0) + 1);
  });

  it('sorts by stacking key and re-sorts after reordering', () => {
    const { board, scene } = setup();
    const [a, b, c] = board.createMany([rect, rect, rect]);
    expect(scene.ordered().map((e) => e.shape.id)).toEqual([a, b, c]);
    board.bringToFront(new Set([a as string]));
    expect(scene.ordered().map((e) => e.shape.id)).toEqual([b, c, a]);
  });

  it('culls by viewport and hit-tests the topmost shape first', () => {
    const { board, scene } = setup();
    const bottom = board.create({ ...rect, fill: 'solid' });
    const top = board.create({ ...rect, fill: 'solid', x: 50 });
    const far = board.create({ ...rect, x: 5000 });
    expect(scene.hit({ x: 75, y: 30 }, 1)?.id).toBe(top);
    expect(scene.hit({ x: 25, y: 30 }, 1)?.id).toBe(bottom);
    expect(scene.query({ x: -10, y: -10, w: 500, h: 500 }).map((e) => e.shape.id)).not.toContain(
      far,
    );
  });

  it('flags remote changes as not local', () => {
    const { board, changes } = setup();
    const other = new Y.Doc();
    new Board(other).create(rect);
    Y.applyUpdate(board.doc, Y.encodeStateAsUpdate(other), 'network');
    expect(changes.at(-1)?.local).toBe(false);
  });
});
