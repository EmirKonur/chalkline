import type { Ink } from '@chalkline/core';

export type ThemeName = 'chalkboard' | 'whiteboard';

export interface Palette {
  /** Board surface, used by exports (the live board paints it in CSS). */
  board: string;
  ink: Record<Ink, string>;
  /** Sticky note paper for each ink. */
  paper: Record<Ink, string>;
  paperText: string;
  paperShadow: string;
  tape: string;
  grid: string;
  selection: string;
  handleFill: string;
  /** Strength of the chalk grain knocked out of the ink, 0 for none. */
  grain: number;
}

export const INK_LABELS: Record<Ink, string> = {
  chalk: 'Chalk white',
  pink: 'Dusty pink',
  butter: 'Butter yellow',
  sky: 'Sky blue',
  mint: 'Mint',
  lilac: 'Lilac',
  peach: 'Peach',
};

/**
 * Ink tokens map to different colors per theme: pastel chalk on slate, and
 * deeper marker tones on the whiteboard so every ink keeps its contrast.
 */
export const PALETTES: Record<ThemeName, Palette> = {
  chalkboard: {
    board: '#21352e',
    ink: {
      chalk: '#f4f1e8',
      pink: '#efb3c1',
      butter: '#f3df94',
      sky: '#a9d3ef',
      mint: '#aee3c6',
      lilac: '#cfc0f1',
      peach: '#f5c19d',
    },
    paper: {
      chalk: '#ebe5d4',
      pink: '#eab6c2',
      butter: '#eedb92',
      sky: '#b6d6ec',
      mint: '#b8e1c9',
      lilac: '#d3c7ee',
      peach: '#f0c6a6',
    },
    paperText: '#1d2b25',
    paperShadow: 'rgba(5, 12, 9, 0.35)',
    tape: 'rgba(244, 241, 232, 0.42)',
    grid: 'rgba(244, 241, 232, 0.11)',
    selection: '#f3df94',
    handleFill: '#21352e',
    grain: 0.32,
  },
  whiteboard: {
    board: '#f5f3ee',
    ink: {
      chalk: '#2a302d',
      pink: '#c64a6e',
      butter: '#b0820c',
      sky: '#2d74b3',
      mint: '#2a855b',
      lilac: '#6e54bf',
      peach: '#c8632a',
    },
    paper: {
      chalk: '#e9e6dd',
      pink: '#f7cdd7',
      butter: '#f9e8a6',
      sky: '#cfe3f5',
      mint: '#cdebd9',
      lilac: '#e0d7f5',
      peach: '#f8d8bf',
    },
    paperText: '#26302b',
    paperShadow: 'rgba(40, 44, 40, 0.16)',
    tape: 'rgba(255, 255, 255, 0.65)',
    grid: 'rgba(42, 48, 45, 0.13)',
    selection: '#2d74b3',
    handleFill: '#ffffff',
    grain: 0,
  },
};
