import type { MeasureText } from './text.ts';

/** Deterministic stand-in for canvas text metrics: every character is 0.5em wide. */
export const monoMeasure: MeasureText = (line, fontSize) => line.length * fontSize * 0.5;
