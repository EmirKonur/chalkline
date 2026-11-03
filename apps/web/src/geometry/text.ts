/** Width of a single line of text, in the same units as `fontSize`. */
export type MeasureText = (line: string, fontSize: number) => number;

export const BOARD_FONT = '"Nunito Variable", Nunito, ui-rounded, system-ui, sans-serif';
export const BOARD_FONT_WEIGHT = 650;
export const LINE_HEIGHT = 1.3;

export const STICKY_PADDING = 18;
const STICKY_FONT_MAX = 26;
const STICKY_FONT_MIN = 12;

export interface TextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
}

/** Free text: lines break only where the author pressed Enter. */
export function layoutText(text: string, fontSize: number, measure: MeasureText): TextLayout {
  const lines = text.split('\n');
  const lineHeight = fontSize * LINE_HEIGHT;
  let width = fontSize * 0.5;
  for (const line of lines) width = Math.max(width, measure(line, fontSize));
  return { lines, fontSize, lineHeight, width, height: lines.length * lineHeight };
}

/**
 * Sticky notes wrap to their width and shrink the font until the text fits,
 * the way people write smaller when they run out of paper.
 */
export function layoutSticky(text: string, w: number, h: number, measure: MeasureText): TextLayout {
  const innerW = Math.max(1, w - STICKY_PADDING * 2);
  const innerH = Math.max(1, h - STICKY_PADDING * 2);
  let fontSize = STICKY_FONT_MAX;
  let lines = wrapText(text, innerW, fontSize, measure);
  while (fontSize > STICKY_FONT_MIN && lines.length * fontSize * LINE_HEIGHT > innerH) {
    fontSize -= 2;
    lines = wrapText(text, innerW, fontSize, measure);
  }
  const lineHeight = fontSize * LINE_HEIGHT;
  return { lines, fontSize, lineHeight, width: innerW, height: lines.length * lineHeight };
}

/** Greedy word wrap. Words wider than the line are broken by character. */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  measure: MeasureText,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/(\s+)/).filter((part) => part.length > 0);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (measure(candidate.trimEnd(), fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.trim().length > 0) out.push(line.trimEnd());
      line = /^\s+$/.test(word) ? '' : word;
      while (measure(line, fontSize) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut), fontSize) > maxWidth) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
