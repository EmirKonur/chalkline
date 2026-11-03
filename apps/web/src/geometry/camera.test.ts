import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitCamera,
  panBy,
  screenToWorld,
  stepZoom,
  worldToScreen,
  zoomAt,
} from './camera.ts';

const camera = fc.record({
  x: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
  y: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
  zoom: fc.double({ min: MIN_ZOOM, max: MAX_ZOOM, noNaN: true }),
});
const screen = fc.record({
  x: fc.double({ min: 0, max: 2000, noNaN: true }),
  y: fc.double({ min: 0, max: 2000, noNaN: true }),
});

describe('camera', () => {
  it('round-trips screen and world coordinates', () => {
    fc.assert(
      fc.property(camera, screen, (cam, s) => {
        const back = worldToScreen(cam, screenToWorld(cam, s));
        expect(back.x).toBeCloseTo(s.x, 6);
        expect(back.y).toBeCloseTo(s.y, 6);
      }),
    );
  });

  it('keeps the world point under the cursor fixed while zooming', () => {
    fc.assert(
      fc.property(
        camera,
        screen,
        fc.double({ min: 0.05, max: 20, noNaN: true }),
        (cam, anchor, factor) => {
          const before = screenToWorld(cam, anchor);
          const after = screenToWorld(zoomAt(cam, anchor, cam.zoom * factor), anchor);
          expect(after.x).toBeCloseTo(before.x, 4);
          expect(after.y).toBeCloseTo(before.y, 4);
        },
      ),
    );
  });

  it('clamps zoom to the supported range', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 100).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0).zoom).toBe(MIN_ZOOM);
  });

  it('pans in screen pixels regardless of zoom', () => {
    const cam = panBy({ x: 0, y: 0, zoom: 2 }, 100, -50);
    expect(cam).toEqual({ x: -50, y: 25, zoom: 2 });
  });

  it('fits content inside the viewport with padding and never zooms past 100%', () => {
    const cam = fitCamera({ x: 100, y: 100, w: 2000, h: 1000 }, 1000, 800, 50);
    expect(cam.zoom).toBeCloseTo(0.45);
    const topLeft = worldToScreen(cam, { x: 100, y: 100 });
    expect(topLeft.x).toBeCloseTo(50);
    expect(fitCamera({ x: 0, y: 0, w: 10, h: 10 }, 1000, 800, 50).zoom).toBe(1);
  });

  it('steps through zoom stops', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.1, -1)).toBe(1);
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
  });
});
