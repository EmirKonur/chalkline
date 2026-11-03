import { useEffect, useRef } from 'react';
import { worldToScreen } from '../geometry/camera.ts';
import type { Point } from '../geometry/vec.ts';
import type { Editor } from '../editor/editor.ts';
import { useStore } from '../lib/store.ts';
import { PALETTES } from '../theme/palette.ts';

const SMOOTHING = 0.32;

/**
 * Collaborators' cursors, as DOM elements over the canvas so labels stay
 * crisp. Awareness updates arrive about every 40 ms; positions are eased
 * toward each update in world space every frame, which hides network jitter
 * and keeps cursors glued to the board while this user pans.
 */
export function RemoteCursors({ editor }: { editor: Editor }) {
  const peers = useStore(editor.presence.peers, (s) => s.list);
  const theme = useStore(editor.store, (s) => s.theme);
  const nodes = useRef(new Map<number, HTMLDivElement>());
  const positions = useRef(new Map<number, Point>());

  useEffect(() => {
    if (peers.length === 0) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = requestAnimationFrame(function step() {
      const camera = editor.camera;
      for (const peer of editor.presence.peers.get().list) {
        const node = nodes.current.get(peer.clientId);
        if (!node || !peer.cursor) continue;
        const current = positions.current.get(peer.clientId);
        const next =
          !current || reduced
            ? peer.cursor
            : {
                x: current.x + (peer.cursor.x - current.x) * SMOOTHING,
                y: current.y + (peer.cursor.y - current.y) * SMOOTHING,
              };
        positions.current.set(peer.clientId, next);
        const screen = worldToScreen(camera, next);
        node.style.transform = `translate3d(${screen.x}px, ${screen.y}px, 0)`;
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, peers.length]);

  const palette = PALETTES[theme];
  return (
    <div className="remote-cursors" aria-hidden="true">
      {peers
        .filter((peer) => peer.cursor)
        .map((peer) => (
          <div
            key={peer.clientId}
            className="remote-cursor"
            data-testid="remote-cursor"
            style={{ ['--peer' as string]: palette.ink[peer.color] }}
            ref={(node) => {
              if (node) nodes.current.set(peer.clientId, node);
              else {
                nodes.current.delete(peer.clientId);
                positions.current.delete(peer.clientId);
              }
            }}
          >
            <svg width="18" height="20" viewBox="0 0 18 20">
              <path d="M2 2L15.5 9.2L9.2 10.6L6.4 17.2Z" />
            </svg>
            <span className="remote-cursor-name">{peer.name}</span>
          </div>
        ))}
    </div>
  );
}
