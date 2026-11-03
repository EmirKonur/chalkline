import { describe, expect, it } from 'vitest';
import { classifyWheel, type WheelLike } from './wheel.ts';

const base: WheelLike = {
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

describe('classifyWheel', () => {
  it('treats ctrl+wheel (trackpad pinch) as zoom, in the right direction', () => {
    const intent = classifyWheel({ ...base, deltaY: -10, ctrlKey: true });
    expect(intent.kind).toBe('zoom');
    expect(intent.kind === 'zoom' && intent.factor).toBeGreaterThan(1);
  });

  it('pans for two-finger trackpad scrolling, which reports wheelDeltaY = -3 * deltaY', () => {
    expect(classifyWheel({ ...base, deltaY: 40, wheelDeltaY: -120 })).toEqual({
      kind: 'pan',
      dx: -0,
      dy: -40,
    });
    expect(classifyWheel({ ...base, deltaX: 12, deltaY: 3, wheelDeltaY: -9 }).kind).toBe('pan');
  });

  it('zooms for a notched mouse wheel', () => {
    expect(classifyWheel({ ...base, deltaY: 100, wheelDeltaY: -120 }).kind).toBe('zoom');
    expect(classifyWheel({ ...base, deltaY: 3, deltaMode: 1 }).kind).toBe('zoom');
  });

  it('pans when it cannot tell, and Shift scrolls sideways', () => {
    expect(classifyWheel({ ...base, deltaY: 100 }).kind).toBe('pan');
    expect(classifyWheel({ ...base, deltaY: 50, shiftKey: true })).toEqual({
      kind: 'pan',
      dx: -50,
      dy: 0,
    });
  });
});
