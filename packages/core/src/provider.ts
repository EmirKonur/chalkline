import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';
import {
  CLOSE_FORBIDDEN_ORIGIN,
  CLOSE_INVALID_ROOM,
  CLOSE_ROOM_FULL,
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  encodeAwareness,
  encodeSyncStep1,
  encodeUpdate,
} from './protocol.ts';

/**
 * - `connecting`: first connection attempt of this session.
 * - `online`: handshake finished, edits flow both ways.
 * - `reconnecting`: the connection dropped and a retry is scheduled.
 * - `offline`: the browser reports no network, or several retries failed.
 * - `rejected`: the server refused the room; retrying would not help.
 */
export type ConnectionPhase = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'rejected';

export interface SyncStatus {
  readonly phase: ConnectionPhase;
  /** Local edits made since the last completed handshake, i.e. not yet sent to the server. */
  readonly pending: number;
  /** Whether a handshake with the server has completed at least once in this session. */
  readonly synced: boolean;
  /** Close code from the server when `phase` is `rejected`. */
  readonly closeCode: number | null;
}

export interface SyncProviderOptions {
  /** Full WebSocket URL for the room, e.g. `wss://host/sync/abc123`. */
  url: string;
  awareness: awarenessProtocol.Awareness;
  /** Decides which transaction origins count as user edits for the pending counter. */
  isUserEdit?: (origin: unknown) => boolean;
  /** Pending count restored from a previous session that ended offline. */
  initialPending?: number;
  /** WebSocket implementation; defaults to the global one (browsers, Node 22+). */
  WebSocket?: typeof WebSocket;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Silence before the client probes the server with a sync step 1. */
  probeAfterMs?: number;
  /** Silence before the client gives up on the socket and reconnects. */
  deadAfterMs?: number;
  /** Failed attempts after which `reconnecting` is reported as `offline`. */
  offlineAfterAttempts?: number;
}

type Listener = (status: SyncStatus) => void;

/**
 * The few browser globals the provider uses, typed so the module compiles
 * (and runs) in Node too, where they are absent.
 */
const env = globalThis as unknown as {
  addEventListener?: (type: 'online' | 'offline', listener: () => void) => void;
  removeEventListener?: (type: 'online' | 'offline', listener: () => void) => void;
  navigator?: { onLine?: boolean };
};

const OPEN = 1;
const CONNECTING = 0;
const REJECT_CODES = new Set([CLOSE_INVALID_ROOM, CLOSE_FORBIDDEN_ORIGIN, CLOSE_ROOM_FULL]);

/**
 * A y-protocols client over a single WebSocket, with reconnect, heartbeat,
 * and a count of edits that have not reached the server yet.
 *
 * Liveness: browsers cannot see WebSocket ping frames, so after
 * `probeAfterMs` of silence the client sends a sync step 1 (its state
 * vector, a few bytes). The server must answer with a step 2, and if nothing
 * arrives by `deadAfterMs` the socket is treated as dead. The probe doubles
 * as a repair: any update lost in transit comes back in that step 2.
 */
export class SyncProvider {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  readonly url: string;

  private readonly WebSocketImpl: typeof WebSocket;
  private readonly isUserEdit: (origin: unknown) => boolean;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly probeAfterMs: number;
  private readonly deadAfterMs: number;
  private readonly offlineAfterAttempts: number;

  private socket: WebSocket | null = null;
  private status: SyncStatus;
  private readonly listeners = new Set<Listener>();
  private wantConnection = false;
  private handshakeDone = false;
  private attempts = 0;
  private openedAt = 0;
  private lastMessageAt = 0;
  private probeSent = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(doc: Y.Doc, options: SyncProviderOptions) {
    this.doc = doc;
    this.awareness = options.awareness;
    this.url = options.url;
    this.WebSocketImpl = options.WebSocket ?? globalThis.WebSocket;
    this.isUserEdit = options.isUserEdit ?? (() => true);
    this.backoffBaseMs = options.backoffBaseMs ?? 500;
    this.backoffMaxMs = options.backoffMaxMs ?? 15_000;
    this.probeAfterMs = options.probeAfterMs ?? 20_000;
    this.deadAfterMs = options.deadAfterMs ?? 30_000;
    this.offlineAfterAttempts = options.offlineAfterAttempts ?? 3;
    this.status = {
      phase: 'connecting',
      pending: options.initialPending ?? 0,
      synced: false,
      closeCode: null,
    };
    doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
    env.addEventListener?.('online', this.handleOnline);
    env.addEventListener?.('offline', this.handleOffline);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(): void {
    this.wantConnection = true;
    this.open();
  }

  /** Closes the connection and stops retrying. Local edits keep counting as pending. */
  disconnect(): void {
    this.wantConnection = false;
    this.clearReconnect();
    const socket = this.socket;
    if (socket) {
      this.drop(socket);
      socket.close();
    }
    this.setStatus({ phase: 'offline' });
  }

  destroy(): void {
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], 'destroy');
    this.disconnect();
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    env.removeEventListener?.('online', this.handleOnline);
    env.removeEventListener?.('offline', this.handleOffline);
    this.listeners.clear();
  }

  private open(): void {
    if (this.socket || !this.wantConnection) return;
    this.clearReconnect();
    if (!browserOnline()) {
      this.setStatus({ phase: 'offline' });
      this.scheduleReconnect(this.backoffMaxMs);
      return;
    }
    const socket = new this.WebSocketImpl(this.url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.handshakeDone = false;
    this.openedAt = Date.now();
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.lastMessageAt = Date.now();
      this.probeSent = false;
      sendBytes(socket, encodeSyncStep1(this.doc));
      if (this.awareness.getLocalState() !== null) {
        sendBytes(socket, encodeAwareness(this.awareness, [this.doc.clientID]));
      }
    };
    socket.onmessage = (event: MessageEvent) => this.handleMessage(socket, event.data);
    socket.onclose = (event: CloseEvent) => {
      if (socket === this.socket) this.drop(socket, event.code);
    };
    this.startWatchdog();
  }

  private handleMessage(socket: WebSocket, data: unknown): void {
    if (socket !== this.socket || !(data instanceof ArrayBuffer)) return;
    this.lastMessageAt = Date.now();
    this.probeSent = false;
    try {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        const kind = syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
        if (kind === syncProtocol.messageYjsSyncStep1) {
          // The reply is a step 2 holding everything the server lacks, which
          // includes every edit made while disconnected.
          sendBytes(socket, encoding.toUint8Array(encoder));
          this.handshakeDone = true;
          this.setStatus({ pending: 0 });
        } else if (kind === syncProtocol.messageYjsSyncStep2) {
          this.attempts = 0;
          this.setStatus({ phase: 'online', synced: true, closeCode: null });
        }
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this,
        );
      }
    } catch {
      // A frame we cannot decode means the stream is out of step; start over.
      socket.close();
      this.drop(socket);
    }
  }

  private readonly handleDocUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return;
    const socket = this.socket;
    if (socket && socket.readyState === OPEN) sendBytes(socket, encodeUpdate(update));
    if (!this.handshakeDone && this.isUserEdit(origin)) {
      this.setStatus({ pending: this.status.pending + 1 });
    }
  };

  private readonly handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin === this) return;
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN) return;
    const changed = [...changes.added, ...changes.updated, ...changes.removed];
    sendBytes(socket, encodeAwareness(this.awareness, changed));
  };

  private readonly handleOnline = (): void => {
    if (!this.wantConnection || this.socket) return;
    this.attempts = 0;
    this.open();
  };

  private readonly handleOffline = (): void => {
    const socket = this.socket;
    if (!socket) return;
    this.drop(socket);
    socket.close();
  };

  /** Detaches a socket and decides what to do next. Safe to call once per socket. */
  private drop(socket: WebSocket, code?: number): void {
    if (socket !== this.socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    this.socket = null;
    this.handshakeDone = false;
    this.stopWatchdog();
    const remote = [...this.awareness.getStates().keys()].filter((c) => c !== this.doc.clientID);
    awarenessProtocol.removeAwarenessStates(this.awareness, remote, this);

    if (code !== undefined && REJECT_CODES.has(code)) {
      this.wantConnection = false;
      this.setStatus({ phase: 'rejected', closeCode: code });
      return;
    }
    if (!this.wantConnection) return;
    this.attempts += 1;
    const offline = !browserOnline() || this.attempts > this.offlineAfterAttempts;
    this.setStatus({ phase: offline ? 'offline' : 'reconnecting' });
    this.scheduleReconnect();
  }

  private scheduleReconnect(delayMs?: number): void {
    this.clearReconnect();
    const exp = Math.min(
      this.backoffMaxMs,
      this.backoffBaseMs * 2 ** Math.max(0, this.attempts - 1),
    );
    // Jitter spreads out a whole room of clients reconnecting after a server restart.
    const delay = delayMs ?? exp * (0.5 + Math.random() * 0.5);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    const tick = Math.max(50, Math.min(5_000, Math.floor(this.probeAfterMs / 4)));
    this.watchdog = setInterval(() => this.checkLiveness(), tick);
  }

  private stopWatchdog(): void {
    if (this.watchdog !== null) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private checkLiveness(): void {
    const socket = this.socket;
    if (!socket) return;
    const now = Date.now();
    if (socket.readyState === CONNECTING) {
      if (now - this.openedAt > this.deadAfterMs) {
        this.drop(socket);
        socket.close();
      }
      return;
    }
    const silent = now - this.lastMessageAt;
    if (silent > this.deadAfterMs) {
      this.drop(socket);
      socket.close();
    } else if (silent > this.probeAfterMs && !this.probeSent && socket.readyState === OPEN) {
      this.probeSent = true;
      sendBytes(socket, encodeSyncStep1(this.doc));
    }
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    const next = { ...this.status, ...patch };
    if (
      next.phase === this.status.phase &&
      next.pending === this.status.pending &&
      next.synced === this.status.synced &&
      next.closeCode === this.status.closeCode
    ) {
      return;
    }
    this.status = next;
    for (const listener of this.listeners) listener(next);
  }
}

function sendBytes(socket: WebSocket, bytes: Uint8Array): void {
  // lib0 types its buffers as ArrayBufferLike; they are never shared buffers.
  socket.send(bytes as Uint8Array<ArrayBuffer>);
}

function browserOnline(): boolean {
  return env.navigator?.onLine !== false;
}
