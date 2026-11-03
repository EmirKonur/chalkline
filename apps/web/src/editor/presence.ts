import { isInk, type Ink } from '@chalkline/core';
import type { Awareness } from 'y-protocols/awareness';
import type { Point } from '../geometry/vec.ts';
import { createStore, type Store } from '../lib/store.ts';

export interface Identity {
  name: string;
  color: Ink;
}

/** What each client publishes through awareness. */
interface PresenceState {
  user: Identity;
  cursor: Point | null;
  selection: string[];
  editing: string | null;
}

export interface Peer {
  clientId: number;
  name: string;
  color: Ink;
  cursor: Point | null;
  selection: readonly string[];
  editing: string | null;
}

const CURSOR_INTERVAL_MS = 40;
const NAME_MAX = 32;

/**
 * Presence over Yjs awareness: names, colors, cursors, and what each person
 * has selected. Awareness is ephemeral by design (never stored, dropped 30 s
 * after a client goes quiet), which is exactly right for cursors.
 */
export class Presence {
  readonly peers: Store<{ list: readonly Peer[] }>;
  private readonly awareness: Awareness;
  private cursorTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCursor: Point | null | undefined;

  constructor(awareness: Awareness, identity: Identity) {
    this.awareness = awareness;
    this.peers = createStore<{ list: readonly Peer[] }>({ list: [] });
    awareness.setLocalState({
      user: identity,
      cursor: null,
      selection: [],
      editing: null,
    } satisfies PresenceState);
    awareness.on('change', this.refresh);
  }

  get clientId(): number {
    return this.awareness.clientID;
  }

  setIdentity(identity: Identity): void {
    this.awareness.setLocalStateField('user', identity);
  }

  /** Cursor updates are throttled; the last position always gets through. */
  setCursor(cursor: Point | null): void {
    this.pendingCursor = cursor;
    if (this.cursorTimer !== null) return;
    this.flushCursor();
    this.cursorTimer = setTimeout(() => {
      this.cursorTimer = null;
      if (this.pendingCursor !== undefined) this.flushCursor();
    }, CURSOR_INTERVAL_MS);
  }

  setSelection(ids: Iterable<string>): void {
    this.awareness.setLocalStateField('selection', [...ids]);
  }

  setEditing(id: string | null): void {
    this.awareness.setLocalStateField('editing', id);
  }

  destroy(): void {
    if (this.cursorTimer !== null) clearTimeout(this.cursorTimer);
    this.awareness.off('change', this.refresh);
  }

  private flushCursor(): void {
    const cursor = this.pendingCursor;
    this.pendingCursor = undefined;
    if (cursor === undefined) return;
    this.awareness.setLocalStateField(
      'cursor',
      cursor ? { x: Math.round(cursor.x * 10) / 10, y: Math.round(cursor.y * 10) / 10 } : null,
    );
  }

  private readonly refresh = (): void => {
    const list: Peer[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId === this.awareness.clientID) return;
      const peer = parsePeer(clientId, state);
      if (peer) list.push(peer);
    });
    list.sort((a, b) => a.name.localeCompare(b.name) || a.clientId - b.clientId);
    this.peers.set({ list });
  };
}

/** Remote awareness is untrusted input; anything malformed is ignored. */
export function parsePeer(clientId: number, state: Record<string, unknown>): Peer | null {
  const user = state.user as Partial<Identity> | undefined;
  if (!user || typeof user.name !== 'string') return null;
  const cursor = state.cursor as Partial<Point> | null | undefined;
  const selection = Array.isArray(state.selection)
    ? state.selection.filter((id): id is string => typeof id === 'string').slice(0, 5000)
    : [];
  return {
    clientId,
    name: user.name.slice(0, NAME_MAX) || 'Guest',
    color: isInk(user.color) ? user.color : 'sky',
    cursor:
      cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)
        ? { x: cursor.x as number, y: cursor.y as number }
        : null,
    selection,
    editing: typeof state.editing === 'string' ? state.editing : null,
  };
}
