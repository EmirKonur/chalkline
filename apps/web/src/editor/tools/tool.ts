import type { Point } from '../../geometry/vec.ts';

export interface PointerSample {
  world: Point;
  pressure: number;
}

/** A pointer event already translated into board terms. */
export interface BoardPointer {
  id: number;
  screen: Point;
  world: Point;
  /** Coalesced positions since the previous event (including this one), for smooth strokes. */
  samples: readonly PointerSample[];
  pressure: number;
  pointerType: string;
  button: number;
  shift: boolean;
  alt: boolean;
  /** Cmd on macOS, Ctrl elsewhere. */
  mod: boolean;
  time: number;
}

/**
 * A tool receives one pointer gesture at a time: `down`, any number of
 * `move`s, then `up` or `cancel`. `hover` runs for movement with no button
 * pressed. `removed` reports shapes another client deleted mid-gesture.
 */
export interface Tool {
  readonly cursor: string;
  down(p: BoardPointer): void;
  move(p: BoardPointer): void;
  up(p: BoardPointer): void;
  cancel(): void;
  hover?(p: BoardPointer): void;
  removed?(ids: ReadonlySet<string>): void;
}
