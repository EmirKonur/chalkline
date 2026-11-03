import { useSyncExternalStore } from 'react';
import type { Editor } from '../editor/editor.ts';

/** Re-renders when the given shape changes; returns its version (or -1 when absent). */
export function useShapeVersion(editor: Editor, id: string | null): number {
  return useSyncExternalStore(
    (listener) =>
      editor.scene.subscribe((change) => {
        if (id && (change.changed.has(id) || change.removed.has(id))) listener();
      }),
    () => (id ? (editor.scene.get(id)?.version ?? -1) : -1),
  );
}

/** Re-renders on any scene change; returns a counter. */
export function useSceneTick(editor: Editor): number {
  return useSyncExternalStore(
    (listener) => editor.scene.subscribe(listener),
    () => editor.scene.tick,
  );
}

export function useShapeCount(editor: Editor): number {
  return useSyncExternalStore(
    (listener) => editor.scene.subscribe(listener),
    () => editor.scene.size,
  );
}
