import type { Shape } from '@chalkline/core';
import { describe, expect, it } from 'vitest';
import { monoMeasure } from '../geometry/test-measure.ts';
import { PALETTES } from '../theme/palette.ts';
import { EXPORT_PADDING, exportSvg } from './svg.ts';

const common = { z: 'a0', ink: 'sky', size: 'm' } as const;
const shapes: Shape[] = [
  { ...common, id: 'r', kind: 'rect', x: 0, y: 0, w: 100, h: 50, fill: 'tint' },
  { ...common, id: 'a', kind: 'arrow', x: 120, y: 25, dx: 80, dy: 0 },
  { ...common, id: 't', kind: 'text', x: 0, y: 80, text: 'p99 < 300ms & <b>', scale: 1 },
  {
    ...common,
    id: 'p',
    kind: 'pen',
    x: 0,
    y: 150,
    points: [0, 0, 0.5, 30, 10, 0.5, 60, 0, 0.5],
    realPressure: false,
    sx: 1,
    sy: 1,
  },
  {
    ...common,
    id: 's',
    kind: 'sticky',
    x: 300,
    y: 0,
    w: 200,
    h: 200,
    text: 'Retro',
    ink: 'butter',
  },
];

describe('exportSvg', () => {
  const svg = exportSvg(shapes, PALETTES.chalkboard, monoMeasure);

  it('emits one element group per shape kind with theme colors', () => {
    expect(svg).toContain('<rect x="0" y="0" width="100" height="50"');
    expect(svg).toContain(`fill="${PALETTES.chalkboard.ink.sky}" fill-opacity="0.2"`);
    expect(svg).toMatch(/<path transform="translate\(0 150\)" d="M[^"]+Z"/);
    expect(svg).toContain(PALETTES.chalkboard.paper.butter);
  });

  it('escapes text content', () => {
    expect(svg).toContain('p99 &lt; 300ms &amp; &lt;b&gt;');
    expect(svg).not.toContain('<b>');
  });

  it('frames the content with padding and a board-colored background', () => {
    const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number) ?? [];
    expect(viewBox[0]).toBeLessThanOrEqual(-EXPORT_PADDING);
    expect(viewBox[0]! + viewBox[2]!).toBeGreaterThanOrEqual(500 + EXPORT_PADDING);
    expect(svg).toContain(`fill="${PALETTES.chalkboard.board}"`);
  });

  it('nests every tag correctly', () => {
    const stack: string[] = [];
    for (const [tag, closing, name] of svg.matchAll(/<(\/?)([a-z]+)[^>]*>/g)) {
      if (closing) expect(stack.pop()).toBe(name);
      else if (!tag.endsWith('/>')) stack.push(name as string);
    }
    expect(stack).toEqual([]);
  });
});
