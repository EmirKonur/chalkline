export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /** Legacy Chromium/WebKit field; present on real events, absent in Firefox. */
  wheelDeltaY?: number;
}

export type WheelIntent =
  { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };

const LINE_PX = 16;
const PAGE_PX = 800;
const PINCH_SPEED = 0.01;
const WHEEL_SPEED = 0.002;

/**
 * Trackpads scroll and pinch; mice have notched wheels. Browsers expose no
 * device type, so this uses the signals that are reliable in practice:
 * pinch arrives as a ctrl+wheel event everywhere, Firefox reports mouse
 * wheels in line mode, and Chromium/WebKit report trackpads with
 * `wheelDeltaY === -3 * deltaY` while wheel notches are multiples of 120.
 * When unsure it pans, because an accidental zoom from a trackpad swipe is
 * far more disorienting than a mouse wheel that scrolls.
 */
export function classifyWheel(e: WheelLike): WheelIntent {
  const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? PAGE_PX : 1;
  const dx = e.deltaX * scale;
  const dy = e.deltaY * scale;

  if (e.ctrlKey || e.metaKey) {
    return { kind: 'zoom', factor: Math.exp(-clamp(dy, -60, 60) * PINCH_SPEED) };
  }
  if (looksLikeMouseWheel(e)) {
    return { kind: 'zoom', factor: Math.exp(-clamp(dy, -300, 300) * WHEEL_SPEED) };
  }
  if (e.shiftKey && dx === 0) return { kind: 'pan', dx: -dy, dy: 0 };
  return { kind: 'pan', dx: -dx, dy: -dy };
}

function looksLikeMouseWheel(e: WheelLike): boolean {
  if (e.deltaX !== 0 || e.deltaY === 0 || e.shiftKey) return false;
  if (e.deltaMode === 1) return true;
  const legacy = e.wheelDeltaY;
  if (typeof legacy !== 'number' || legacy === 0) return false;
  if (Math.abs(legacy) === Math.abs(e.deltaY) * 3) return false;
  return legacy % 120 === 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
