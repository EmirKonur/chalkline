import type { SyncProvider } from '@chalkline/core/provider';
import { useSyncStatus } from './useSyncStatus.ts';

function pendingText(pending: number): string {
  if (pending === 0) return 'all changes saved here';
  return pending === 1 ? '1 change waiting' : `${pending} changes waiting`;
}

/** Connection pill: live, connecting, reconnecting, or offline with the pending count. */
export function ConnectionStatus({ provider, peers }: { provider: SyncProvider; peers: number }) {
  const status = useSyncStatus(provider);
  let label: string;
  let detail: string;
  switch (status.phase) {
    case 'online':
      label = 'Live';
      detail =
        peers === 0
          ? 'Connected. Share the link to draw together.'
          : `Connected with ${peers} ${peers === 1 ? 'other person' : 'other people'}.`;
      break;
    case 'connecting':
      label = 'Connecting';
      detail = 'Opening the board connection.';
      break;
    case 'reconnecting':
      label = status.pending > 0 ? `Reconnecting · ${pendingText(status.pending)}` : 'Reconnecting';
      detail = 'The connection dropped. Keep drawing; edits sync when it is back.';
      break;
    case 'offline':
      label = `Offline · ${pendingText(status.pending)}`;
      detail = 'Edits are stored in this browser and sync automatically when you are back online.';
      break;
    case 'rejected':
      label = 'Not syncing';
      detail = 'The server refused this board.';
      break;
  }
  return (
    <div
      className={`status-pill status-${status.phase}`}
      role="status"
      aria-live="polite"
      data-tip={detail}
      data-tip-side="bottom-end"
      data-testid="connection-status"
      data-phase={status.phase}
    >
      <span className="status-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
