import { Board, CLOSE_INVALID_ROOM } from '@chalkline/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.ts';
import { bootServer, closeClient, connectClient, online, waitFor, type Client } from './helpers.ts';

const rect = {
  kind: 'rect',
  x: 0,
  y: 0,
  w: 120,
  h: 80,
  fill: 'none',
  ink: 'chalk',
  size: 'm',
} as const;

describe('sync through the real server', () => {
  const clients: Client[] = [];
  const servers: RunningServer[] = [];
  const dirs: string[] = [];

  async function server(overrides?: Parameters<typeof bootServer>[0]) {
    const s = await bootServer(overrides);
    servers.push(s);
    return s;
  }

  function client(s: RunningServer, room: string) {
    const c = connectClient(s, room);
    clients.push(c);
    return c;
  }

  function tempDb(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'chalkline-test-'));
    dirs.push(dir);
    return path.join(dir, 'board.db');
  }

  afterEach(async () => {
    for (const c of clients.splice(0)) closeClient(c);
    for (const s of servers.splice(0)) await s.close();
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('delivers a shape created in one doc to the other', async () => {
    const s = await server();
    const alice = client(s, 'room-one');
    const bob = client(s, 'room-one');
    await waitFor(online(alice));
    await waitFor(online(bob));

    const id = new Board(alice.doc).create(rect);
    await waitFor(() => new Board(bob.doc).has(id));
    expect(new Board(bob.doc).get(id)).toMatchObject({ kind: 'rect', w: 120 });
  });

  it('keeps rooms isolated from each other', async () => {
    const s = await server();
    const alice = client(s, 'room-a1');
    const bob = client(s, 'room-b1');
    await waitFor(online(alice));
    await waitFor(online(bob));
    new Board(alice.doc).create(rect);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(new Board(bob.doc).list()).toHaveLength(0);
  });

  it('relays presence and clears it when a client leaves', async () => {
    const s = await server();
    const alice = client(s, 'presence');
    const bob = client(s, 'presence');
    await waitFor(online(alice));
    await waitFor(online(bob));

    alice.awareness.setLocalState({ user: { name: 'Alice' }, cursor: { x: 10, y: 20 } });
    await waitFor(() => bob.awareness.getStates().has(alice.doc.clientID));
    expect(bob.awareness.getStates().get(alice.doc.clientID)).toMatchObject({
      cursor: { x: 10, y: 20 },
    });

    alice.provider.disconnect();
    await waitFor(() => !bob.awareness.getStates().has(alice.doc.clientID));
  });

  it('counts edits made offline and merges them on reconnect', async () => {
    const s = await server();
    const alice = client(s, 'offline');
    const bob = client(s, 'offline');
    await waitFor(online(alice));
    await waitFor(online(bob));

    alice.provider.disconnect();
    const aliceBoard = new Board(alice.doc);
    aliceBoard.create(rect);
    aliceBoard.create({ ...rect, x: 200 });
    aliceBoard.create({ ...rect, x: 400 });
    expect(alice.provider.getStatus()).toMatchObject({ phase: 'offline', pending: 3 });

    new Board(bob.doc).create({ ...rect, y: 300 });

    alice.provider.connect();
    await waitFor(online(alice));
    await waitFor(() => new Board(bob.doc).list().length === 4);
    await waitFor(() => aliceBoard.list().length === 4);
    expect(alice.provider.getStatus().pending).toBe(0);
  });

  it('lets a deletion win over a move made by someone who was offline', async () => {
    const s = await server();
    const alice = client(s, 'delete-vs-move');
    const bob = client(s, 'delete-vs-move');
    await waitFor(online(alice));
    await waitFor(online(bob));
    const id = new Board(alice.doc).create(rect);
    await waitFor(() => new Board(bob.doc).has(id));

    alice.provider.disconnect();
    new Board(alice.doc).update(id, { x: 999 });
    new Board(bob.doc).remove([id]);

    alice.provider.connect();
    await waitFor(online(alice));
    await waitFor(() => !new Board(alice.doc).has(id));
    expect(new Board(bob.doc).has(id)).toBe(false);
  });

  it('restores a room from SQLite after a restart', async () => {
    const databasePath = tempDb();
    const first = await server({ databasePath });
    const alice = client(first, 'durable');
    await waitFor(online(alice));
    const board = new Board(alice.doc);
    const id = board.create(rect);
    board.setTitle('Durable board');
    await waitFor(() => first.store.stats('durable').rows > 0);
    closeClient(clients.pop() as Client);
    await first.close();
    servers.pop();

    const second = await server({ databasePath });
    const bob = client(second, 'durable');
    await waitFor(online(bob));
    expect(new Board(bob.doc).get(id)).toMatchObject({ w: 120 });
    expect(new Board(bob.doc).title).toBe('Durable board');
  });

  it('compacts the update log into one snapshot', async () => {
    const s = await server({ compactAfterUpdates: 5 });
    const alice = client(s, 'compaction');
    await waitFor(online(alice));
    const board = new Board(alice.doc);
    const id = board.create({
      kind: 'pen',
      x: 0,
      y: 0,
      points: [0, 0, 0.5],
      realPressure: false,
      sx: 1,
      sy: 1,
      ink: 'mint',
      size: 'm',
    });
    for (let i = 1; i <= 12; i++) {
      board.appendPoints(id, [i, i, 0.5]);
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    await waitFor(() => (s.rooms.peek('compaction') ? s.store.stats('compaction').rows : 99) < 5);

    const bob = client(s, 'compaction');
    await waitFor(online(bob));
    await waitFor(() => new Board(bob.doc).list()[0]?.kind === 'pen');
    const pen = new Board(bob.doc).get(id);
    expect(pen?.kind === 'pen' && pen.points.length).toBe(13 * 3);
  });

  it('gets back edits the server lost, from a client that still has them', async () => {
    const first = await server();
    const alice = client(first, 'server-amnesia');
    await waitFor(online(alice));
    const id = new Board(alice.doc).create(rect);
    await waitFor(() => first.rooms.peek('server-amnesia') !== undefined);
    const port = first.port;
    await first.close();
    servers.pop();

    // A fresh, empty database on the same port: the server has lost everything.
    const second = await server({ port, databasePath: ':memory:' });
    await waitFor(online(alice));
    const bob = client(second, 'server-amnesia');
    await waitFor(() => new Board(bob.doc).has(id));
  });

  it('rejects an invalid room id with a close code the client does not retry', async () => {
    const s = await server();
    const bad = client(s, 'x');
    await waitFor(() => bad.provider.getStatus().phase === 'rejected');
    expect(bad.provider.getStatus().closeCode).toBe(CLOSE_INVALID_ROOM);
    expect(s.rooms.size).toBe(0);
  });
});
