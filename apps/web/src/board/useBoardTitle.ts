import type { Board } from '@chalkline/core';
import { useSyncExternalStore } from 'react';

export function useBoardTitle(board: Board): string {
  return useSyncExternalStore(
    (listener) => {
      board.meta.observe(listener);
      return () => board.meta.unobserve(listener);
    },
    () => board.title,
  );
}
