import type { Shape } from '@chalkline/core';
import { describe, expect, it } from 'vitest';
import { parseClipboard, serializeShapes } from './clipboard.ts';

const sticky: Shape = {
  id: 'n1',
  z: 'a0',
  kind: 'sticky',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  text: 'Retro',
  ink: 'butter',
  size: 'm',
};

describe('clipboard', () => {
  it('round-trips shapes through our payload', () => {
    expect(parseClipboard(serializeShapes([sticky]), '')).toEqual({
      kind: 'shapes',
      shapes: [sticky],
    });
  });

  it('reads the payload from text/plain when the custom type was dropped', () => {
    expect(parseClipboard('', serializeShapes([sticky]))).toMatchObject({ kind: 'shapes' });
  });

  it('turns foreign text into a text paste, normalizing line endings', () => {
    expect(parseClipboard('', '  first\r\nsecond  ')).toEqual({
      kind: 'text',
      text: 'first\nsecond',
    });
  });

  it('ignores lookalike JSON and drops invalid shapes', () => {
    expect(parseClipboard('', '{"shapes": []}')).toEqual({ kind: 'text', text: '{"shapes": []}' });
    const mixed = JSON.stringify({
      app: 'chalkline',
      version: 1,
      shapes: [{ kind: 'nope' }, sticky],
    });
    expect(parseClipboard(mixed, '')).toEqual({ kind: 'shapes', shapes: [sticky] });
    expect(parseClipboard('', '   ')).toBeNull();
  });
});
