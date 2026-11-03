# Architecture

Chalkline is three packages in one pnpm workspace:

| Package         | Runs in          | Responsibility                                                                                                                         |
| --------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core` | browser and Node | Document schema and typed operations (`Board`), stacking keys, point encoding, the wire protocol, and the sync client (`SyncProvider`) |
| `apps/server`   | Node 26          | HTTP + WebSocket server: one in-memory room per active board, SQLite update log, static files for the built web app                    |
| `apps/web`      | browser          | Editor model, tools, Canvas 2D renderer, React UI, IndexedDB persistence                                                               |

The core package exists because three programs need the same document code: the
browser, the server's integration tests, and the scripts that seed demo boards and
run the render benchmark. It is consumed as TypeScript source (no build step); Vite
compiles it for the browser and Node strips types at runtime.

## Data model

```mermaid
classDiagram
  class YDoc {
    shapes: Y.Map~id, Y.Map~
    meta: Y.Map
  }
  class Shape {
    kind: pen | rect | ellipse | line | arrow | text | sticky
    x, y: number
    z: string (fractional index)
    ink: chalk | pink | butter | sky | mint | lilac | peach
    size: s | m | l | xl
  }
  class Pen {
    points: Y.Array~int~ (x, y, pressure triples, fixed point)
    sx, sy: number (scale from resizing)
    realPressure: boolean
  }
  class Box {
    w, h: number
    fill: none | tint | solid
  }
  class Line {
    dx, dy: number
  }
  class Text {
    text: Y.Text
    scale: number
  }
  class Sticky {
    w, h: number
    text: Y.Text
  }
  YDoc --> Shape
  Shape <|-- Pen
  Shape <|-- Box
  Shape <|-- Line
  Shape <|-- Text
  Shape <|-- Sticky
```

Colors are ink tokens, not hex values. Each theme maps tokens to its own colors
(`apps/web/src/theme/palette.ts`), so a pastel pink drawn on the chalkboard shows
up as a deeper marker pink for someone viewing the same board in the whiteboard
theme, with contrast intact for both.

`meta` holds the board title. Presence (cursors, selections, who is typing where)
is not in the document; it travels through Yjs awareness and is never stored.

## Client

```mermaid
flowchart LR
  subgraph Input
    P[Pointer and wheel events] --> CV[CanvasView]
    K[Keyboard and clipboard] --> BI[useBoardInput]
  end
  CV --> E[Editor]
  BI --> E
  E -->|tool gestures| T[Tools: select, pen, shapes, text, sticky, eraser]
  T -->|Board operations, origin = this client| D[(Y.Doc)]
  D -->|observeDeep| S[Scene: plain-object mirror, sorted, with bounds]
  S --> R[Renderer: Canvas 2D, on demand]
  E --> R
  D <--> H[History: Y.UndoManager, local origin only]
  D <--> IDB[(IndexedDB)]
  D <--> SP[SyncProvider]
  A[Awareness] <--> SP
  A --> PR[Presence: peers, cursors] --> RC[RemoteCursors DOM layer]
```

- **Editor** (`editor/editor.ts`) owns the camera, selection, active tool, text
  editing state, and clipboard. It has no DOM; `CanvasView` translates pointer
  events into board coordinates and feeds them in, which keeps the interaction
  logic testable without a browser.
- **Scene** (`editor/scene.ts`) mirrors the `shapes` map into plain objects with
  precomputed bounds. It updates incrementally from deep-observe events and tracks
  two versions per shape: `version` (any change) and `geomVersion` (changes that
  alter the shape's own outline). Moving a stroke changes `x`/`y` only, so its
  cached `Path2D` is reused.
- **Renderer** (`render/renderer.ts`) runs only when something marks the frame
  dirty, culls by bounding box, and draws overlays (selection, other people's
  selections, marquee, eraser) on the same canvas after the shapes.
- **Tools** write to the document as the gesture happens. A pen stroke is created
  on pointer down and its points are appended on every pointer move, so other
  people see the line being drawn. Undo boundaries are cut explicitly at the start
  and end of each gesture.

## Sync

### Joining a board

```mermaid
sequenceDiagram
  participant B as Browser
  participant I as IndexedDB
  participant S as Server room
  participant DB as SQLite
  B->>I: load cached updates for this board
  I-->>B: local copy applied (board visible, editable)
  B->>S: WebSocket /sync/<room>
  S->>DB: first connection: load rows, apply to room doc
  S-->>B: sync step 1 (server state vector)
  S-->>B: awareness of everyone already here
  B->>S: sync step 1 (client state vector)
  B->>S: awareness (my name, color, cursor)
  B-->>S: sync step 2 (what the server lacks, including offline edits)
  S-->>B: sync step 2 (what the client lacks)
  Note over B: phase = online, pending = 0
```

The client waits for IndexedDB before opening the socket. Its first state vector
then reflects the cache, and the server's step 2 carries only what changed since
the last visit.

### Live editing

Every local transaction produces a Yjs update. The provider sends it as a sync
`update` message; the room applies it to its doc (origin = the sending socket),
broadcasts it to every other socket, and buffers it for the next write. Awareness
works the same way, except that the server also records which awareness client ids
each socket speaks for, so it can broadcast their removal when the socket closes.

### Going offline and coming back

```mermaid
sequenceDiagram
  participant A as Alice (offline)
  participant S as Server
  participant B as Bob
  Note over A: socket drops, phase = reconnecting then offline
  A->>A: edits go to Y.Doc and IndexedDB, pending counts undo steps
  B->>S: Bob keeps editing
  Note over A: network back (online event or backoff timer)
  A->>S: connect, sync step 1
  S-->>A: sync step 1 + step 2 (Bob's edits)
  A->>S: sync step 2 (Alice's offline edits)
  S-->>B: broadcast Alice's edits
  Note over A,B: both docs identical, pending = 0
```

Reconnect uses exponential backoff (500 ms doubling to 15 s, with jitter so a room
full of clients does not stampede a restarted server). The browser's `offline`
event drops the socket immediately instead of waiting for a timeout.

### Liveness

Browsers do not expose WebSocket ping frames to JavaScript. After 20 s without
any message, the client sends a sync step 1, which the server must answer with a
step 2; after 30 s of silence the socket is considered dead and replaced. The
server separately pings every 30 s and terminates sockets that do not answer.

## Server

```mermaid
flowchart TB
  U[HTTP upgrade /sync/:room] --> V{origin allowed? room id valid? room full?}
  V -- no --> X[close 4403 / 4400 / 4429]
  V -- yes --> RM[Rooms: get or load room]
  RM --> R[Room: Y.Doc + Awareness + sockets]
  R -->|every update| BUF[buffer]
  BUF -->|after 500 ms| ROW[(append merged row)]
  ROW -->|200 rows, idle 30 s, or shutdown| C[compact: replace rows with one snapshot]
  H[GET /healthz] --> OK[rooms, connections]
  ST[other GET] --> SV[sirv: built web app, SPA fallback, CSP]
```

- Rooms load synchronously (node:sqlite is synchronous), so two sockets joining a
  cold room cannot both load it.
- A malformed frame closes that socket with 1007; other sockets in the room are
  unaffected.
- On SIGTERM the server closes sockets with 1001, flushes and compacts every room,
  then closes the database. Clients reconnect with backoff to the next instance.

## Undo

`History` wraps `Y.UndoManager` scoped to the `shapes` and `meta` maps, tracking
only transactions whose origin is this client's board origin. Remote updates are
applied with the provider as origin and are never captured. When undoing a change
whose value someone else has since overwritten, Yjs declines to restore it, so
undo never clobbers newer work by a collaborator. Each stack item stores the
selection at the time of the change, and undo restores it.

## Security notes

Boards are capability URLs: anyone with the link can read and edit. There are no
accounts. The server validates room ids, caps message size (8 MB) and connections
per room (64), can restrict WebSocket origins with `ALLOWED_ORIGINS`, and serves the
app with a strict Content Security Policy (`default-src 'self'`). All document
content is treated as untrusted input on every client.
