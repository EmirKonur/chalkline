# 0005: SQLite update log with compaction, on node:sqlite

Status: accepted

## Context

The server must keep boards across restarts. Yjs updates are commutative and
idempotent, so storage needs no ordering guarantees beyond "what was accepted is
in there". What hurts is volume: a pen stroke streams an update per pointer event,
and a board that is saved as a growing list of updates gets slower to load forever.

Options considered:

- **Snapshot only** (write `encodeStateAsUpdate` on every change). Simple, but it
  rewrites the whole board for every stroke point.
- **LevelDB** (what y-leveldb uses). Fine, but another native dependency.
- **SQLite via better-sqlite3.** The usual choice; a native module that needs a
  prebuilt binary for every Node version and platform in the build matrix.
- **SQLite via `node:sqlite`.** Built into Node, a release candidate on Node 26,
  no native build step. It prints an experimental warning on Node 23.

## Decision

`node:sqlite` with an append-only table `doc_updates(room, id, data, created_at)`:

1. Updates arriving in a room are buffered for 500 ms and written as one row
   (`Y.mergeUpdates`).
2. When a room has 200 rows, or when it has been empty for 30 s, or when the server
   shuts down, the rows are replaced in one transaction by a single
   `Y.encodeStateAsUpdate` of the live document.

Compaction uses the live document rather than merging rows because the live doc
has garbage-collected deleted content. Measured with Yjs 13.6 on a 600-point stroke
streamed as 102 updates: the log holds 6.2 KB; after the stroke is erased, the
compacted snapshot is 44 bytes.

The server runs its TypeScript directly (Node strips types), so with no native
modules the Docker image needs no build tools and no server build step.

## Consequences

- A crash can lose up to 500 ms of updates on the server. Nothing is lost overall
  while any client still holds them: on reconnect the client's sync step 2 sends
  everything the server is missing. The integration suite tests exactly this by
  restarting the server with an empty database.
- `node:sqlite` is not yet marked stable. If its API changes, the impact is
  limited to `apps/server/src/store.ts` (about 80 lines).
- Loading a room is synchronous, which removes join races, but a very large board
  blocks the event loop while it loads.
