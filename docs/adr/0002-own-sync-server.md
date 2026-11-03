# 0002: A small ws + y-protocols server instead of Hocuspocus

Status: accepted

## Context

The client needs a relay that runs the Yjs sync handshake, fans out updates and
presence to everyone in a room, and persists documents. Three ways to get one:

- **Hocuspocus (4.x).** Batteries included: auth hooks, extensions for SQLite and
  Redis, webhooks. It also brings its own message envelope, its own client
  provider, and its own persistence lifecycle, and most of its hooks would be
  unused here.
- **The y-websocket reference server.** Small, but it moved to a separate package
  with LevelDB persistence, and it echoes every awareness update back to the
  sender.
- **Write one on `ws` and `y-protocols`.** About 300 lines across `room.ts`,
  `rooms.ts`, `server.ts`, and `store.ts`.

## Decision

Write the server. It speaks the y-websocket wire format (message 0 for sync, 1 for
awareness), so stock y-websocket clients interoperate, and it owns the parts that
matter for this project:

- **Persistence policy.** Updates are buffered for 500 ms, written as one merged
  row, and compacted into a snapshot after 200 rows or when the room goes idle.
- **Presence ownership.** Each socket tracks which awareness client ids it speaks
  for, and an id moves to the newer socket when a client reconnects before its old
  socket has timed out, so a slow close cannot erase a live cursor.
- **Rejections the client understands.** Invalid room ids, foreign origins, and
  full rooms are closed after the upgrade with 4400, 4403, and 4429, which the
  client treats as final instead of retrying forever.

The client provider (`packages/core/src/provider.ts`) is also custom, mainly for
the offline change counter and the heartbeat described in the README.

## Consequences

- Fewer dependencies and nothing hidden: every message the server sends is in
  `room.ts`.
- No authentication. Boards are capability URLs (anyone with the link can edit).
  Adding auth means checking a token in the upgrade handler before `join`; the
  structure allows it but it is not built.
- One process holds each room in memory, so the server does not scale
  horizontally as is. Running several instances would need sticky routing by room
  id or a pub/sub fan-out between instances.
