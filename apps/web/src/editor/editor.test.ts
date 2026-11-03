import { Board, type ShapeInit } from '@chalkline/core';
import { describe, expect, it } from 'vitest';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { monoMeasure } from '../geometry/test-measure.ts';
import type { Point } from '../geometry/vec.ts';
import { Editor, type Toast } from './editor.ts';
import { History } from './history.ts';
import { Presence } from './presence.ts';
import { Scene } from './scene.ts';
import type { BoardPointer } from './tools/tool.ts';

/** An editor for "me" plus a second board for a collaborator, synced both ways. */
function setup() {
  const mine = new Y.Doc();
  const theirs = new Y.Doc();
  mine.on(
    'update',
    (u: Uint8Array, origin: unknown) => origin !== 'net' && Y.applyUpdate(theirs, u, 'net'),
  );
  theirs.on(
    'update',
    (u: Uint8Array, origin: unknown) => origin !== 'net' && Y.applyUpdate(mine, u, 'net'),
  );
  const board = new Board(mine, { who: 'me' });
  const history = new History(board);
  const scene = new Scene(board, monoMeasure, (origin) => history.isLocal(origin));
  const awareness = new Awareness(mine);
  const presence = new Presence(awareness, { name: 'Me', color: 'pink' });
  const toasts: Toast[] = [];
  const editor = new Editor({
    board,
    history,
    scene,
    presence,
    measure: monoMeasure,
    theme: 'chalkboard',
    notify: (toast) => toasts.push(toast),
    reducedMotion: () => true,
  });
  history.bindSelection(
    () => [...editor.state.selection],
    (ids) => editor.select(ids),
  );
  editor.setViewport(1000, 800);
  return { editor, collaborator: new Board(theirs), toasts, awareness };
}

let clock = 0;
function pointer(at: Point, extra: Partial<BoardPointer> = {}): BoardPointer {
  clock += 100;
  return {
    id: 1,
    screen: at,
    world: at,
    samples: [{ world: at, pressure: 0.5 }],
    pressure: 0.5,
    pointerType: 'mouse',
    button: 0,
    shift: false,
    alt: false,
    mod: false,
    time: clock,
    ...extra,
  };
}

const solid: ShapeInit = {
  kind: 'rect',
  x: 100,
  y: 100,
  w: 200,
  h: 100,
  fill: 'solid',
  ink: 'sky',
  size: 'm',
};

describe('Editor', () => {
  it('keeps the text of a note someone deletes while I type in it, and can restore it', () => {
    const { editor, collaborator, toasts, awareness } = setup();
    const id = editor.board.create({
      kind: 'sticky',
      x: 0,
      y: 0,
      w: 200,
      h: 200,
      text: '',
      ink: 'butter',
      size: 'm',
    });
    editor.startEditing(id);
    editor.updateEditingText('half a thought');

    collaborator.remove([id]);
    expect(editor.state.editing).toBeNull();
    expect(toasts.at(-1)?.message).toMatch(/deleted the note/);

    toasts.at(-1)?.action?.run();
    const [restored] = editor.board.list();
    expect(restored).toMatchObject({ kind: 'sticky', text: 'half a thought' });
    expect(editor.editingId()).toBe(restored?.id);
    awareness.destroy();
  });

  it('ends a drag cleanly when someone deletes the shape being moved', () => {
    const { editor, collaborator, toasts, awareness } = setup();
    const id = editor.board.create(solid);
    editor.setTool('select');
    editor.pointerDown(pointer({ x: 150, y: 150 }));
    editor.pointerMove(pointer({ x: 170, y: 160 }));
    expect(editor.board.get(id)).toMatchObject({ x: 120, y: 110 });

    collaborator.remove([id]);
    expect(toasts.at(-1)?.message).toBe('Someone deleted a shape you were moving.');
    editor.pointerMove(pointer({ x: 260, y: 200 }));
    editor.pointerUp(pointer({ x: 260, y: 200 }));
    expect(editor.board.list()).toHaveLength(0);
    expect(collaborator.list()).toHaveLength(0);
    expect(editor.state.selection.size).toBe(0);
    awareness.destroy();
  });

  it('undoes a whole drag in one step and restores the selection', () => {
    const { editor, awareness } = setup();
    const id = editor.board.create(solid);
    editor.setTool('select');
    editor.pointerDown(pointer({ x: 150, y: 150 }));
    for (let x = 160; x <= 300; x += 20) editor.pointerMove(pointer({ x, y: 150 }));
    editor.pointerUp(pointer({ x: 300, y: 150 }));
    editor.select([]);
    editor.undo();
    expect(editor.board.get(id)?.x).toBe(100);
    expect([...editor.state.selection]).toEqual([id]);
    awareness.destroy();
  });

  it('pastes copied shapes centered on the pointer and selects the copies', () => {
    const { editor, awareness } = setup();
    const id = editor.board.create(solid);
    editor.select([id]);
    const copied = editor.copySelection() ?? '';
    editor.pointerMove(pointer({ x: 600, y: 500 }));
    editor.paste(copied, copied);
    const copies = editor.selectedShapes();
    expect(copies).toHaveLength(1);
    expect(copies[0]?.id).not.toBe(id);
    expect(copies[0]).toMatchObject({ x: 500, y: 450, w: 200 });
    awareness.destroy();
  });

  it('turns pasted plain text into a text shape', () => {
    const { editor, awareness } = setup();
    editor.paste('', 'Ask the payments team');
    const [shape] = editor.board.list();
    expect(shape).toMatchObject({ kind: 'text', text: 'Ask the payments team' });
    awareness.destroy();
  });

  it('applies a color change to the selection as one undo step', () => {
    const { editor, awareness } = setup();
    const [a, b] = editor.board.createMany([solid, { ...solid, x: 400 }]);
    editor.select([a as string, b as string]);
    editor.setStyle({ ink: 'mint' });
    expect(editor.board.list().map((s) => s.ink)).toEqual(['mint', 'mint']);
    editor.undo();
    expect(editor.board.list().map((s) => s.ink)).toEqual(['sky', 'sky']);
    awareness.destroy();
  });
});
