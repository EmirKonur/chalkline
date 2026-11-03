import { FILLS, INKS, SIZES, type Fill, type Size } from '@chalkline/core';
import { keyLabel } from '../editor/shortcuts.ts';
import type { Editor } from '../editor/editor.ts';
import { useStore } from '../lib/store.ts';
import { INK_LABELS, PALETTES } from '../theme/palette.ts';
import { useSceneTick } from './useShapeVersion.ts';

const SIZE_LABELS: Record<Size, string> = { s: 'Fine', m: 'Medium', l: 'Bold', xl: 'Extra bold' };
const SIZE_DOT: Record<Size, number> = { s: 4, m: 7, l: 11, xl: 16 };
const FILL_LABELS: Record<Fill, string> = {
  none: 'No fill',
  tint: 'Tinted fill',
  solid: 'Solid fill',
};
/** A little irregularity so the sticks look set down by hand. */
const STICK_TILT = [-5, 3, -2, 6, -4, 2, -6];

/**
 * The chalk tray: colors are sticks of chalk lying on the ledge (the chosen
 * one is picked up), then stroke weight, then fill for shapes that have one.
 */
export function Tray({ editor }: { editor: Editor }) {
  const tool = useStore(editor.store, (s) => s.tool);
  const style = useStore(editor.store, (s) => s.style);
  const theme = useStore(editor.store, (s) => s.theme);
  const selection = useStore(editor.store, (s) => s.selection);
  const editing = useStore(editor.store, (s) => s.editing);
  useSceneTick(editor);
  if (tool === 'eraser' || tool === 'hand') return null;

  const palette = PALETTES[theme];
  const selected = editor.selectedShapes();
  const showFill =
    tool === 'rect' ||
    tool === 'ellipse' ||
    selected.some((s) => s.kind === 'rect' || s.kind === 'ellipse');
  const target = selection.size > 0 && !editing ? `${selection.size} selected` : null;

  return (
    <div
      className="palette tray"
      role="toolbar"
      aria-label={target ? `Style for ${target}` : 'Chalk style'}
    >
      <div className="tray-section sticks" role="group" aria-label="Chalk color">
        {INKS.map((ink, i) => (
          <button
            key={ink}
            type="button"
            className="stick-btn"
            aria-label={INK_LABELS[ink]}
            aria-pressed={style.ink === ink}
            data-tip={`${INK_LABELS[ink]}  ${keyLabel(String(i + 1))}`}
            data-tip-side="top"
            onClick={() => editor.setStyle({ ink })}
            data-testid={`ink-${ink}`}
          >
            <span
              className="stick"
              style={{
                ['--stick' as string]: palette.ink[ink],
                ['--tilt' as string]: `${STICK_TILT[i] ?? 0}deg`,
              }}
            />
          </button>
        ))}
      </div>
      <span className="tray-divider" aria-hidden="true" />
      <div className="tray-section" role="group" aria-label="Stroke weight">
        {SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className="weight-btn"
            aria-label={SIZE_LABELS[size]}
            aria-pressed={style.size === size}
            data-tip={SIZE_LABELS[size]}
            data-tip-side="top"
            onClick={() => editor.setStyle({ size })}
          >
            <span
              className="weight-dot"
              style={{
                width: SIZE_DOT[size],
                height: SIZE_DOT[size],
                background: palette.ink[style.ink],
              }}
            />
          </button>
        ))}
      </div>
      {showFill && (
        <>
          <span className="tray-divider" aria-hidden="true" />
          <div className="tray-section" role="group" aria-label="Fill">
            {FILLS.map((fill) => (
              <button
                key={fill}
                type="button"
                className="fill-btn"
                aria-label={FILL_LABELS[fill]}
                aria-pressed={style.fill === fill}
                data-tip={FILL_LABELS[fill]}
                data-tip-side="top"
                onClick={() => editor.setStyle({ fill })}
              >
                <span
                  className={`fill-swatch fill-${fill}`}
                  style={{ ['--ink' as string]: palette.ink[style.ink] }}
                />
              </button>
            ))}
          </div>
        </>
      )}
      {target && <span className="tray-target">{target}</span>}
    </div>
  );
}
