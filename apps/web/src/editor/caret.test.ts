import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { transformIndex } from './caret.ts';

/** Applies a remote edit to a Y.Text and returns where a caret at `caret` ends up. */
function caretAfter(
  initial: string,
  caret: number,
  edit: (text: Y.Text) => void,
): { text: string; caret: number } {
  const doc = new Y.Doc();
  const text = doc.getText('t');
  text.insert(0, initial);
  let moved = caret;
  text.observe((event) => {
    moved = transformIndex(moved, event.delta);
  });
  edit(text);
  return { text: text.toJSON(), caret: moved };
}

describe('transformIndex', () => {
  it('shifts the caret right for text inserted before it', () => {
    expect(caretAfter('hello world', 6, (t) => t.insert(0, '>> '))).toEqual({
      text: '>> hello world',
      caret: 9,
    });
  });

  it('leaves the caret alone for edits after it', () => {
    expect(caretAfter('hello world', 5, (t) => t.insert(11, '!')).caret).toBe(5);
    expect(caretAfter('hello world', 5, (t) => t.delete(6, 5)).caret).toBe(5);
  });

  it('pulls the caret back for deletions before it', () => {
    expect(caretAfter('hello world', 8, (t) => t.delete(0, 6)).caret).toBe(2);
  });

  it('moves the caret to the start of a deletion that swallowed it', () => {
    expect(caretAfter('hello world', 4, (t) => t.delete(2, 6)).caret).toBe(2);
  });
});
