import type { WebSocket } from 'ws';
import type { Logger } from './logger.ts';
import { Room, type RoomOptions } from './room.ts';
import type { DocStore } from './store.ts';

/** Rooms currently held in memory, opened on first connection and dropped when idle. */
export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private readonly store: DocStore;
  private readonly log: Logger;
  private readonly options: RoomOptions;

  constructor(store: DocStore, log: Logger, options: RoomOptions) {
    this.store = store;
    this.log = log;
    this.options = options;
  }

  get size(): number {
    return this.rooms.size;
  }

  get connectionCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.connectionCount;
    return total;
  }

  /** Loading is synchronous (node:sqlite), so two sockets joining at once cannot race. */
  join(id: string, ws: WebSocket): void {
    let room = this.rooms.get(id);
    if (!room) {
      room = Room.open(id, this.store, this.log, this.options, (closed) => {
        if (this.rooms.get(closed.id) === closed) this.rooms.delete(closed.id);
      });
      this.rooms.set(id, room);
    }
    room.join(ws);
  }

  peek(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  closeAll(code: number): void {
    for (const room of [...this.rooms.values()]) room.close(code);
  }
}
