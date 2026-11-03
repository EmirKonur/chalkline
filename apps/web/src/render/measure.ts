import { BOARD_FONT, BOARD_FONT_WEIGHT, type MeasureText } from '../geometry/text.ts';

const BASE_SIZE = 100;
const CACHE_LIMIT = 20_000;

export interface CanvasMeasure {
  measure: MeasureText;
  /** Drops cached widths, e.g. after the web font finishes loading. */
  reset(): void;
}

/**
 * Measures at one base size and scales linearly, so each distinct line is
 * measured once no matter how many sizes it is drawn at.
 */
export function createCanvasMeasure(): CanvasMeasure {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map<string, number>();
  const font = `${BOARD_FONT_WEIGHT} ${BASE_SIZE}px ${BOARD_FONT}`;
  return {
    measure(line, fontSize) {
      if (line.length === 0 || !ctx) return 0;
      let width = cache.get(line);
      if (width === undefined) {
        if (cache.size > CACHE_LIMIT) cache.clear();
        ctx.font = font;
        width = ctx.measureText(line).width;
        cache.set(line, width);
      }
      return (width * fontSize) / BASE_SIZE;
    },
    reset() {
      cache.clear();
    },
  };
}
