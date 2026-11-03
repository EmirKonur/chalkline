/**
 * Seeds a realistic board into a running server, for trying the app or
 * taking screenshots.
 *
 *   pnpm seed:demo --room demo-checkout
 *   pnpm seed:demo --board retro --room team-retro
 *   pnpm seed:demo --room demo-checkout --peers   (keeps two collaborators online)
 */
import type { Ink } from '@chalkline/core';
import { parseArgs } from 'node:util';
import { connect, settle, type ScriptClient } from './client.ts';
import { DEMO_BOARDS, type DemoBoard } from './demo-boards.ts';

const { values } = parseArgs({
  options: {
    server: { type: 'string', default: 'ws://localhost:4111' },
    room: { type: 'string', default: 'demo-checkout' },
    board: { type: 'string', default: 'system-design' },
    peers: { type: 'boolean', default: false },
  },
});

const kind = values.board as DemoBoard;
if (!(kind in DEMO_BOARDS)) {
  process.stderr.write(
    `Unknown board "${values.board}". Use one of: ${Object.keys(DEMO_BOARDS).join(', ')}\n`,
  );
  process.exit(1);
}

const seeder = await connect(values.server, values.room).catch(() => {
  process.stderr.write(
    `Could not reach a sync server at ${values.server}. Start one with "pnpm dev" first.\n`,
  );
  process.exit(1);
});
const demo = DEMO_BOARDS[kind]();
const ids = seeder.board.list().length === 0 ? seeder.board.createMany(demo.shapes) : [];
if (ids.length > 0) seeder.board.setTitle(demo.title);
await settle(seeder);
process.stdout.write(
  ids.length > 0
    ? `Seeded ${ids.length} shapes into "${values.room}".\n`
    : `"${values.room}" already has shapes; left it as is.\n`,
);

if (!values.peers) {
  seeder.close();
  process.exit(0);
}

interface PeerSpec {
  name: string;
  color: Ink;
  cursor: { x: number; y: number };
  /** Text of the shape this person has selected. */
  selects?: string;
}

const PEERS: Record<DemoBoard, PeerSpec[]> = {
  'system-design': [
    { name: 'Maya Chen', color: 'pink', cursor: { x: 1365, y: 452 } },
    { name: 'Theo Okafor', color: 'sky', cursor: { x: 1600, y: 390 }, selects: 'p99 budget' },
  ],
  retro: [
    { name: 'Priya Nair', color: 'mint', cursor: { x: 420, y: 330 } },
    { name: 'Sam Weller', color: 'lilac', cursor: { x: 1430, y: 290 }, selects: 'Rotate on-call' },
  ],
};

const shapes = seeder.board.list();
const peers: ScriptClient[] = [];
for (const spec of PEERS[kind]) {
  const selected = shapes.find(
    (s) => 'text' in s && spec.selects && s.text.startsWith(spec.selects),
  );
  const peer = await connect(values.server, values.room);
  peer.awareness.setLocalState({
    user: { name: spec.name, color: spec.color },
    cursor: spec.cursor,
    selection: selected ? [selected.id] : [],
    editing: null,
  });
  peers.push(peer);
}
process.stdout.write(`${peers.length} collaborators online. Press Ctrl+C to disconnect them.\n`);

process.once('SIGINT', () => {
  for (const peer of [...peers, seeder]) peer.close();
  process.exit(0);
});
process.once('SIGTERM', () => process.emit('SIGINT'));
