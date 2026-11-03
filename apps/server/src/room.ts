import {
  CLOSE_ROOM_FULL,
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  encodeAwareness,
  encodeSyncStep1,
  encodeUpdate,
} from '@chalkline/core';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { WebSocket, type RawData } from 'ws';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type { Logger } from './logger.ts';
import type { DocStore } from './store.ts';

export interface RoomOptions {
  compactAfterUpdates: number;
  flushIntervalMs: number;
  idleUnloadMs: number;
  maxConnections: number;
}

/**
 * One board held in memory while anyone is connected. The room relays sync
 * and awareness messages between sockets and writes document updates to the
 * store in batches.
 *
 * Batching trade-off: updates are buffered for `flushIntervalMs` and written
 * as one merged row. A crash loses at most that window on the server, and
 * nothing is lost overall as long as one client still holds the edits: on
 * reconnect its sync step 2 carries everything the server is missing.
 */
export class Room {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  /** Socket -> awareness client ids that socket speaks for. */
  private readonly conns = new Map<WebSocket, Set<number>>();
  private buffer: Uint8Array[] = [];
  private rows = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  readonly id: string;
  private readonly store: DocStore;
  private readonly log: Logger;
  private readonly options: RoomOptions;
  private readonly onUnload: (room: Room) => void;

  private constructor(
    id: string,
    store: DocStore,
    log: Logger,
    options: RoomOptions,
    onUnload: (room: Room) => void,
  ) {
    this.id = id;
    this.store = store;
    this.log = log;
    this.options = options;
    this.onUnload = onUnload;
    // The server has no cursor of its own.
    this.awareness.setLocalState(null);
  }

  static open(
    id: string,
    store: DocStore,
    log: Logger,
    options: RoomOptions,
    onUnload: (room: Room) => void,
  ): Room {
    const started = performance.now();
    const room = new Room(id, store, log.child({ room: id }), options, onUnload);
    const rows = store.load(id);
    if (rows.length > 0) Y.applyUpdate(room.doc, Y.mergeUpdates(rows));
    room.rows = rows.length;
    room.doc.on('update', room.handleUpdate);
    room.awareness.on('update', room.handleAwareness);
    room.log.info(
      {
        rows: rows.length,
        bytes: rows.reduce((sum, row) => sum + row.byteLength, 0),
        ms: Math.round(performance.now() - started),
      },
      'room loaded',
    );
    if (room.rows > options.compactAfterUpdates) room.compact();
    return room;
  }

  get connectionCount(): number {
    return this.conns.size;
  }

  join(ws: WebSocket): void {
    if (this.conns.size >= this.options.maxConnections) {
      ws.close(CLOSE_ROOM_FULL, 'room is full');
      return;
    }
    this.cancelIdle();
    this.conns.set(ws, new Set());
    ws.on('message', (data) => this.receive(ws, data));
    ws.on('close', () => this.leave(ws));
    ws.on('error', (error) => this.log.warn({ err: error }, 'socket error'));
    send(ws, encodeSyncStep1(this.doc));
    const clients = [...this.awareness.getStates().keys()];
    if (clients.length > 0) send(ws, encodeAwareness(this.awareness, clients));
    this.log.debug({ connections: this.conns.size }, 'client joined');
  }

  /** Writes buffered updates as one merged row, compacting when the log has grown. */
  flush(): void {
    this.clearFlushTimer();
    if (this.buffer.length === 0) return;
    const merged =
      this.buffer.length === 1 ? (this.buffer[0] as Uint8Array) : Y.mergeUpdates(this.buffer);
    this.buffer = [];
    this.store.append(this.id, merged);
    this.rows += 1;
    if (this.rows >= this.options.compactAfterUpdates) this.compact();
  }

  /**
   * Replaces the room's update log with one snapshot of the current state.
   * The snapshot comes from the live document, which has garbage-collected
   * the content of deleted shapes, so it is usually far smaller than the sum
   * of the rows it replaces.
   */
  compact(): void {
    this.clearFlushTimer();
    const started = performance.now();
    const before = this.store.stats(this.id);
    // The live doc already contains every buffered update.
    this.buffer = [];
    const snapshot = Y.encodeStateAsUpdate(this.doc);
    this.store.replace(this.id, snapshot);
    this.rows = 1;
    this.log.info(
      {
        rowsBefore: before.rows,
        bytesBefore: before.bytes,
        bytesAfter: snapshot.byteLength,
        ms: Math.round(performance.now() - started),
      },
      'room compacted',
    );
  }

  /** Persists everything and releases the room. Open sockets are closed with `code`. */
  close(code = 1001): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelIdle();
    for (const ws of this.conns.keys()) ws.close(code, 'room closed');
    this.conns.clear();
    this.flush();
    if (this.rows > 1) this.compact();
    this.awareness.destroy();
    this.doc.destroy();
    this.onUnload(this);
    this.log.info('room unloaded');
  }

  private receive(ws: WebSocket, data: RawData): void {
    try {
      const decoder = decoding.createDecoder(toBytes(data));
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, ws);
        // Only a step 1 produces a reply; updates and step 2 leave the encoder empty.
        if (encoding.length(encoder) > 1) send(ws, encoding.toUint8Array(encoder));
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          ws,
        );
      }
    } catch (error) {
      this.log.warn({ err: error }, 'dropping client after malformed message');
      ws.close(1007, 'malformed message');
    }
  }

  private leave(ws: WebSocket): void {
    const controlled = this.conns.get(ws);
    if (!controlled) return;
    this.conns.delete(ws);
    if (controlled.size > 0) {
      awarenessProtocol.removeAwarenessStates(this.awareness, [...controlled], null);
    }
    this.log.debug({ connections: this.conns.size }, 'client left');
    if (this.conns.size === 0 && !this.closed) this.scheduleIdle();
  }

  private readonly handleUpdate = (update: Uint8Array, origin: unknown): void => {
    this.buffer.push(update);
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => this.flush(), this.options.flushIntervalMs);
    }
    const message = encodeUpdate(update);
    for (const ws of this.conns.keys()) {
      if (ws !== origin) send(ws, message);
    }
  };

  private readonly handleAwareness = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ): void => {
    if (origin instanceof WebSocket) {
      const owner = this.conns.get(origin);
      if (owner) {
        for (const client of [...added, ...updated]) {
          // A client that reconnected before its old socket timed out now
          // belongs to the new socket, so the old one's close must not remove it.
          for (const other of this.conns.values()) other.delete(client);
          owner.add(client);
        }
        for (const client of removed) owner.delete(client);
      }
    }
    const changed = [...added, ...updated, ...removed];
    if (changed.length === 0) return;
    const message = encodeAwareness(this.awareness, changed);
    for (const ws of this.conns.keys()) {
      if (ws !== origin) send(ws, message);
    }
  };

  private scheduleIdle(): void {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      if (this.conns.size === 0) this.close();
    }, this.options.idleUnloadMs);
  }

  private cancelIdle(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}

function send(ws: WebSocket, message: Uint8Array): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(message, (error) => {
    if (error) ws.terminate();
  });
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
