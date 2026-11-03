# 0004: Shapes in a Y.Map, stacking by fractional index

Status: accepted

## Context

Shapes need identity (so two people can edit the same one), per-field merging,
and a stacking order that people can change concurrently.

The obvious model, a `Y.Array` of shapes in paint order, breaks under concurrency.
Yjs cannot move an element; a move is a delete plus an insert. If two people
bring the same shape to the front at the same time, both deletes merge into one,
but both inserts survive, and the shape is now on the board twice.

## Decision

- `doc.getMap('shapes')` maps shape id to a nested `Y.Map` of fields (`kind`, `x`,
  `y`, `z`, `ink`, `size`, plus kind-specific ones). Pen points live in a nested
  `Y.Array` so a stroke can stream in while it is drawn; text lives in a `Y.Text`
  so two people can type in one note.
- Stacking order is a string field `z` from fractional indexing. Render order is
  `(z, id)`. Bringing a shape forward writes one key between its new neighbors.
- `keyBetween` appends two random characters to the generated key, so two
  clients that bring different shapes to the front at the same moment get
  distinct keys and later inserts between them still have room. Ties that
  happen anyway are broken by id, and `rekey` re-keys any run of equal keys it
  meets.
- A move writes `x` and `y` in one transaction. Concurrent moves of one shape
  resolve per field with the same winner for both fields, because both writes
  start from the same previous values, so the shape lands at one person's drop
  point rather than a blend. A move and a concurrent recolor both survive.

## Consequences

- Reordering one shape is one small update instead of an array splice, and it
  never duplicates shapes.
- Keys grow when people repeatedly insert between the same two neighbors. In
  practice they stay short (a few characters), but there is no rebalancing pass.
- Reading paint order requires a sort; the scene mirror keeps a sorted array and
  only re-sorts when a `z` changes or shapes are added or removed.
