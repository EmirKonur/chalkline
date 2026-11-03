import type { Board } from '@chalkline/core';
import * as Y from 'yjs';
import { createStore, type Store } from '../lib/store.ts';

/**
 * Per-user undo. The undo manager only tracks transactions whose origin is
 * this client's board origin, so changes that arrived over the network are
 * never captured and can never be undone from here. Yjs also refuses to
 * restore a value that someone else has overwritten since, so undoing your
 * move after a collaborator moved the same shape leaves their position alone.
 *
 * Capturing is cut explicitly at gesture boundaries instead of by timeout. A
 * timeout would split a slow pen stroke into several undo steps whenever the
 * pointer paused mid-stroke. One undo step is also what the connection pill
 * counts as one "change waiting" while offline.
 */
export class History {
  readonly manager: Y.UndoManager;
  readonly state: Store<{ canUndo: boolean; canRedo: boolean }>;
  private readonly board: Board;
  private getSelection: () => readonly string[] = () => [];
  private restoreSelection: (ids: string[]) => void = () => {};
  private freshStep = false;

  constructor(board: Board) {
    this.board = board;
    this.manager = new Y.UndoManager([board.shapes, board.meta], {
      trackedOrigins: new Set([board.origin]),
      captureTimeout: Number.POSITIVE_INFINITY,
    });
    this.state = createStore<{ canUndo: boolean; canRedo: boolean }>({
      canUndo: false,
      canRedo: false,
    });
    const refresh = () =>
      this.state.set({ canUndo: this.manager.canUndo(), canRedo: this.manager.canRedo() });
    this.manager.on('stack-item-added', (event: { stackItem: { meta: Map<string, unknown> } }) => {
      this.freshStep = true;
      event.stackItem.meta.set('selection', [...this.getSelection()]);
      refresh();
    });
    this.manager.on('stack-item-popped', (event: { stackItem: { meta: Map<string, unknown> } }) => {
      const ids = event.stackItem.meta.get('selection');
      if (Array.isArray(ids)) {
        this.restoreSelection((ids as unknown[]).map(String).filter((id) => this.board.has(id)));
      }
      refresh();
    });
    this.manager.on('stack-cleared', refresh);
  }

  /** Lets undo and redo save and restore the editor's selection. */
  bindSelection(get: () => readonly string[], restore: (ids: string[]) => void): void {
    this.getSelection = get;
    this.restoreSelection = restore;
  }

  /**
   * True once per undo step: for the first document update of a new step,
   * false for the rest of it. Yjs emits the undo manager's events before the
   * document's update event, so this is accurate inside an update handler.
   */
  takeFreshStep(): boolean {
    const fresh = this.freshStep;
    this.freshStep = false;
    return fresh;
  }

  /** Ends the current undo step; the next change starts a new one. */
  cut(): void {
    this.manager.stopCapturing();
  }

  undo(): void {
    this.cut();
    this.manager.undo();
  }

  redo(): void {
    this.cut();
    this.manager.redo();
  }

  /** Whether a transaction origin is an edit by this user (directly or via undo/redo). */
  isLocal(origin: unknown): boolean {
    return origin === this.board.origin || origin === this.manager;
  }

  destroy(): void {
    this.manager.destroy();
  }
}
