# 0001: Yjs CRDTs for the board document

Status: accepted

## Context

A whiteboard has many people editing one document at once, often the same
shapes, and the brief requires offline editing that merges on reconnect. That
rules out a server that serializes every edit (it cannot accept edits from a
client it cannot reach) and means the merge rules have to be deterministic on
every client without coordination.

The options considered:

- **Operational transformation with an authoritative server.** Mature for text,
  but offline editing turns into long transform chains, and every new operation
  type (move, restack, resize) needs its own transform functions.
- **Automerge.** A solid CRDT with a nice document API. Its binary format and
  Rust/WASM core were heavier to ship in the browser bundle than Yjs, and the
  ecosystem for WebSocket sync, awareness, and IndexedDB is smaller.
- **Yjs.** A CRDT with shared types (map, array, text), a compact binary update
  format, garbage collection of deleted content, and a separate small protocol
  package (y-protocols) for sync and awareness.

## Decision

Use Yjs (13.6) for the document, y-protocols for the wire protocol and presence,
and y-indexeddb for the offline copy. The schema and every write go through one
typed wrapper (`packages/core/src/board.ts`) so the rest of the code never touches
Y types directly.

## Consequences

- Any two clients that have seen the same updates render the same board, in any
  order of arrival, with no server round trip. Offline editing is the normal path,
  not a special mode.
- Conflict resolution is per field, last writer wins, which is right for a board
  (two people moving one shape) but means the schema has to be designed so that
  nothing important depends on two fields being written together by one person.
  See [0004](0004-shapes-in-a-map-with-fractional-z-order.md).
- Yjs keeps tombstones for deleted structs (the content itself is garbage
  collected). Long-lived boards grow slowly even when nothing is on them; the
  server's compaction ([0005](0005-sqlite-update-log-with-compaction.md)) keeps
  load time flat but cannot remove tombstones.
- Anything any client writes is accepted by every other client, so all reads are
  defensive (`readShape` validates every field).
