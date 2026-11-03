import { LinkSimpleIcon } from '@phosphor-icons/react';
import { keyLabel } from '../editor/shortcuts.ts';

/** Shown on a board with nothing on it. It never blocks the canvas underneath. */
export function EmptyState({ onCopyLink }: { onCopyLink: () => void }) {
  return (
    <div className="empty-state" data-testid="empty-state">
      <svg className="empty-doodle" viewBox="0 0 220 80" aria-hidden="true">
        <path d="M12 52C40 18 70 66 102 40S160 14 206 34" pathLength={1} />
        <path d="M188 22L207 34L190 46" pathLength={1} />
      </svg>
      <h2>A clean board.</h2>
      <p>
        Pick up the chalk with <kbd>{keyLabel('P')}</kbd> and start sketching, or drop a sticky note
        with <kbd>S</kbd>. Everyone with the link draws here with you, live.
      </p>
      <button type="button" className="btn btn-secondary" onClick={onCopyLink}>
        <LinkSimpleIcon size={18} weight="bold" aria-hidden="true" />
        Copy invite link
      </button>
    </div>
  );
}
