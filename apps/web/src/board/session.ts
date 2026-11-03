import { Board, SYNC_PATH } from '@chalkline/core';
import { SyncProvider } from '@chalkline/core/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { History } from '../editor/history.ts';
import { readJson, writeJson } from '../lib/storage.ts';

/** `slow` means IndexedDB did not answer in time; the board opens anyway. */
export type LocalCopy = 'loaded' | 'slow' | 'unavailable';

export interface BoardSession {
  roomId: string;
  doc: Y.Doc;
  board: Board;
  history: History;
  awareness: Awareness;
  provider: SyncProvider;
  /** Resolves once the IndexedDB copy is in the doc (or IndexedDB is unusable). */
  localCopy: Promise<LocalCopy>;
  destroy(): void;
}

const LOCAL_LOAD_TIMEOUT_MS = 2500;

export function syncUrl(roomId: string): string {
  const configured = import.meta.env.VITE_SYNC_URL as string | undefined;
  const base =
    configured && configured.length > 0
      ? configured.replace(/\/$/, '')
      : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  return `${base}${SYNC_PATH}${encodeURIComponent(roomId)}`;
}

const pendingKey = (roomId: string) => `chalkline:pending:${roomId}`;

/**
 * Wires one board's document to its two homes: IndexedDB in this browser and
 * the sync server. The socket opens only after the local copy has loaded, so
 * the first sync step 1 carries a state vector that already reflects the
 * cache and the server sends just the difference instead of the whole board.
 */
export function openSession(roomId: string): BoardSession {
  const doc = new Y.Doc();
  const board = new Board(doc, { client: 'local' });
  const history = new History(board);
  const awareness = new Awareness(doc);
  const provider = new SyncProvider(doc, {
    url: syncUrl(roomId),
    awareness,
    // One pending "change" per undo step, not per transaction: a pen stroke
    // streams dozens of small updates but is one thing the user did.
    isUserEdit: (origin) => history.isLocal(origin) && history.takeFreshStep(),
    initialPending: readJson<number>(pendingKey(roomId), 0),
  });
  const stopPendingWrites = provider.subscribe((status) =>
    writeJson(pendingKey(roomId), status.pending),
  );

  let persistence: IndexeddbPersistence | null = null;
  let destroyed = false;
  const localCopy = new Promise<LocalCopy>((resolve) => {
    try {
      persistence = new IndexeddbPersistence(`chalkline:${roomId}`, doc);
      const timer = setTimeout(() => resolve('slow'), LOCAL_LOAD_TIMEOUT_MS);
      persistence.whenSynced.then(
        () => {
          clearTimeout(timer);
          resolve('loaded');
        },
        () => resolve('unavailable'),
      );
    } catch {
      resolve('unavailable');
    }
  });
  void localCopy.then(() => {
    if (!destroyed) provider.connect();
  });

  // Leaving the page drops our cursor for everyone right away instead of
  // after the 30 s awareness timeout. A page restored from the back/forward
  // cache has a dead socket, so it starts over.
  const onPageHide = () => provider.destroy();
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) location.reload();
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  return {
    roomId,
    doc,
    board,
    history,
    awareness,
    provider,
    localCopy,
    destroy() {
      destroyed = true;
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      stopPendingWrites();
      provider.destroy();
      history.destroy();
      void persistence?.destroy();
      awareness.destroy();
      doc.destroy();
    },
  };
}
