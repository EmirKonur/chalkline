# 0003: Render the board with Canvas 2D

Status: accepted

## Context

The board must stay at 60 fps with about 2,000 shapes, most of them freehand
strokes whose outlines are filled polygons with a few hundred vertices each. It
also needs a chalk texture on the ink and cheap zoom.

- **SVG / DOM.** Hit testing and accessibility come for free, and text editing is
  native. But 2,000 path elements with a few hundred vertices each make style
  recalculation and layout the bottleneck during zoom, culling means adding and
  removing nodes, and a grain texture per shape needs filters, which are slow.
- **WebGL.** The fastest option for very large boards, at the cost of writing
  tessellation for strokes, text rendering, and antialiasing by hand.
- **Canvas 2D.** Immediate mode: draw exactly the shapes in view each frame,
  `Path2D` objects can be cached, and pattern fills give the texture for free.

## Decision

Canvas 2D, drawn on demand (a frame is scheduled only when something changed).
The renderer culls by bounding box, caches each stroke's `Path2D` keyed by a
geometry version that a pure move does not bump, draws text that is smaller than
3.5 px on screen as bars, and fills ink with a per-color pattern that has the
grain knocked out of it. Text editing uses a textarea laid over the canvas, and
the canvas carries an `aria-label` with the shape count.

## Measurements

`pnpm bench:render` seeds 2,000 mixed shapes (60% pen strokes of 40 to 120
points) over a real WebSocket, opens the board in Chromium at 1440x900, 2x device
pixel ratio, and drives pan and pinch-zoom with a wheel event every frame for 4 s.
Apple M2 Pro, macOS 15 (Darwin 24.6), Chromium 156 via Playwright 1.64.1, Node 23.11:

| Scenario                              | Headed (GPU) FPS | Render mean / p95 (ms) | Shapes drawn per frame |
| ------------------------------------- | ---------------- | ---------------------- | ---------------------- |
| Pan, zoomed to fit, all 2,000 in view | 119.7            | 3.37 / 3.8             | 1,931                  |
| Pan at 100%, culling active           | 120              | 0.49 / 0.6             | 160                    |
| Pinch-zoom sweep                      | 120              | 3.10 / 3.8             | 1,771                  |

The display runs at 120 Hz, so frames are paced by the display, not the renderer.
"Render" is the time spent issuing draw calls on the main thread. The grain is
not free: with the plain whiteboard theme the same "all in view" frame costs 1.46 ms
instead of 3.37 ms.

Headless Chromium (software rasterizer, no GPU) is a useful worst case: main thread
render time is the same (3.65 ms) but rasterizing a 2880x1800 canvas with every shape
in view takes long enough that it runs at about 15 FPS; at 1x it reaches 31 FPS, and
with culling at 100% zoom it holds 60 FPS.

## Consequences

- Hit testing, marquee selection, and the eraser are implemented by hand
  (`apps/web/src/geometry/hit.ts`), with unit tests.
- SVG export is a second, small serializer that reuses the same pen outlines, so
  exported strokes match the canvas exactly.
- Beyond roughly 20,000 shapes the linear culling pass would start to show; a
  spatial index is the next step if boards get that large.
