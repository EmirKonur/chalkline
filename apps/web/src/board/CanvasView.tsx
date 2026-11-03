import { useEffect, useRef } from 'react';
import { screenToWorld } from '../geometry/camera.ts';
import type { Editor } from '../editor/editor.ts';
import type { BoardPointer, PointerSample } from '../editor/tools/tool.ts';
import { useStore } from '../lib/store.ts';
import { Renderer } from '../render/renderer.ts';
import { useShapeCount } from './useShapeVersion.ts';

interface GestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

/** The drawing surface: owns the canvas element, the renderer, and raw input. */
export function CanvasView({ editor }: { editor: Editor }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursor = useStore(editor.store, (s) => s.cursor);
  const count = useShapeCount(editor);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new Renderer(canvas, editor);
    let rect = canvas.getBoundingClientRect();
    const measure = () => {
      rect = canvas.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(canvas);
    const dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', measure);

    const local = (clientX: number, clientY: number) => ({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
    const toPointer = (e: PointerEvent): BoardPointer => {
      const screen = local(e.clientX, e.clientY);
      const world = screenToWorld(editor.camera, screen);
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const samples: PointerSample[] =
        coalesced.length > 0
          ? coalesced.map((c) => ({
              world: screenToWorld(editor.camera, local(c.clientX, c.clientY)),
              pressure: c.pressure,
            }))
          : [{ world, pressure: e.pressure }];
      return {
        id: e.pointerId,
        screen,
        world,
        samples,
        pressure: e.pressure,
        pointerType: e.pointerType,
        button: e.button,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: e.metaKey || e.ctrlKey,
        time: e.timeStamp,
      };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      editor.pointerDown(toPointer(e));
    };
    const onMove = (e: PointerEvent) => editor.pointerMove(toPointer(e));
    const onUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      editor.pointerUp(toPointer(e));
    };
    const onCancel = (e: PointerEvent) => {
      editor.cancelGesture();
      editor.pointerUp(toPointer(e));
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') editor.pointerLeave();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      editor.wheel(
        {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaMode: e.deltaMode,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          shiftKey: e.shiftKey,
          wheelDeltaY: (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY,
        },
        local(e.clientX, e.clientY),
      );
    };
    // Safari reports trackpad pinch as gesture events rather than ctrl+wheel.
    let lastScale = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as GestureEvent;
      editor.zoomBy(g.scale / lastScale, local(g.clientX, g.clientY));
      lastScale = g.scale;
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('gesturestart', onGestureStart);
    canvas.addEventListener('gesturechange', onGestureChange);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      resizeObserver.disconnect();
      dprQuery.removeEventListener('change', measure);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('gesturestart', onGestureStart);
      canvas.removeEventListener('gesturechange', onGestureChange);
      canvas.removeEventListener('contextmenu', onContextMenu);
      renderer.destroy();
    };
  }, [editor]);

  return (
    <canvas
      ref={canvasRef}
      className="board-canvas"
      style={{ cursor }}
      tabIndex={0}
      role="application"
      aria-roledescription="whiteboard"
      aria-label={`Board with ${count} ${count === 1 ? 'shape' : 'shapes'}. Press question mark for keyboard shortcuts.`}
      data-testid="board-canvas"
    />
  );
}
