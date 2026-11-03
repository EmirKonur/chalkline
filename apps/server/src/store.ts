import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

export interface RoomStats {
  rows: number;
  bytes: number;
}

/**
 * Append-only log of Yjs updates per room, in SQLite.
 *
 * Yjs updates are commutative and idempotent, so the log never needs
 * ordering guarantees beyond "everything that was acknowledged is in here".
 * Appends are cheap; compaction periodically replaces a room's rows with a
 * single snapshot so load time does not grow with edit history.
 */
export class DocStore {
  private readonly db: DatabaseSync;
  private readonly selectRows: StatementSync;
  private readonly insertRow: StatementSync;
  private readonly deleteRows: StatementSync;
  private readonly statsQuery: StatementSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS doc_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room TEXT NOT NULL,
        data BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS doc_updates_room_id ON doc_updates (room, id);
    `);
    this.selectRows = this.db.prepare('SELECT data FROM doc_updates WHERE room = ? ORDER BY id');
    this.insertRow = this.db.prepare(
      'INSERT INTO doc_updates (room, data, created_at) VALUES (?, ?, ?)',
    );
    this.deleteRows = this.db.prepare('DELETE FROM doc_updates WHERE room = ?');
    this.statsQuery = this.db.prepare(
      'SELECT COUNT(*) AS rows, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM doc_updates WHERE room = ?',
    );
  }

  load(room: string): Uint8Array[] {
    return this.selectRows.all(room).map((row) => row.data as Uint8Array);
  }

  append(room: string, update: Uint8Array): void {
    this.insertRow.run(room, update, Date.now());
  }

  /** Replaces every row of `room` with `snapshot`, atomically. */
  replace(room: string, snapshot: Uint8Array): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.deleteRows.run(room);
      this.insertRow.run(room, snapshot, Date.now());
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  stats(room: string): RoomStats {
    const row = this.statsQuery.get(room) as { rows: number; bytes: number } | undefined;
    return { rows: Number(row?.rows ?? 0), bytes: Number(row?.bytes ?? 0) };
  }

  close(): void {
    this.db.close();
  }
}
