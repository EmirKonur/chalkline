import { describe, expect, it } from 'vitest';
import { STICKY_PADDING, layoutSticky, layoutText, wrapText } from './text.ts';
import { monoMeasure } from './test-measure.ts';

describe('text layout', () => {
  it('breaks free text only on newlines', () => {
    const layout = layoutText('one line\nand another one', 20, monoMeasure);
    expect(layout.lines).toEqual(['one line', 'and another one']);
    expect(layout.width).toBe(15 * 10);
  });

  it('wraps words and breaks words that are too long by character', () => {
    expect(wrapText('ship the offline mode', 100, 20, monoMeasure)).toEqual([
      'ship the',
      'offline',
      'mode',
    ]);
    expect(wrapText('supercalifragilistic', 50, 20, monoMeasure)).toEqual([
      'super',
      'calif',
      'ragil',
      'istic',
    ]);
  });

  it('keeps blank lines the author typed', () => {
    expect(wrapText('a\n\nb', 100, 20, monoMeasure)).toEqual(['a', '', 'b']);
  });

  it('shrinks sticky text until it fits the note', () => {
    const short = layoutSticky('Retro', 200, 200, monoMeasure);
    const long = layoutSticky('word '.repeat(60), 200, 200, monoMeasure);
    expect(long.fontSize).toBeLessThan(short.fontSize);
    expect(short.width).toBe(200 - STICKY_PADDING * 2);
  });
});
