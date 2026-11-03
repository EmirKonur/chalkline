import { useEffect, useRef } from 'react';
import { SHORTCUTS, keyLabel, type ShortcutGroup } from '../editor/shortcuts.ts';

const ORDER: ShortcutGroup[] = ['Tools', 'Edit', 'View', 'Arrange', 'Board'];

/** The `?` overlay. A native <dialog> gives focus trapping and Escape for free. */
export function Cheatsheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="cheatsheet"
      aria-labelledby="cheatsheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === '?') onClose();
      }}
    >
      <header className="cheatsheet-head">
        <h2 id="cheatsheet-title">Keyboard shortcuts</h2>
        <button type="button" className="btn btn-quiet btn-small" onClick={onClose}>
          Close <kbd>Esc</kbd>
        </button>
      </header>
      <div className="cheatsheet-grid">
        {ORDER.map((group) => (
          <section key={group} className="cheatsheet-group" aria-labelledby={`keys-${group}`}>
            <h3 id={`keys-${group}`}>{group}</h3>
            <dl>
              {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                <div className="cheatsheet-row" key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>
                    {s.keys.map((combo, i) => (
                      <span key={combo.join('+')} className="key-combo">
                        {i > 0 && (
                          <span className="key-or">{s.label === 'Chalk colors' ? 'to' : 'or'}</span>
                        )}
                        {combo.map((key) => (
                          <kbd key={key}>{keyLabel(key)}</kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
