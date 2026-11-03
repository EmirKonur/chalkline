import { newRoomId, CLOSE_FORBIDDEN_ORIGIN, CLOSE_ROOM_FULL } from '@chalkline/core';
import { useEffect, useState } from 'react';
import { loadIdentity } from '../app/identity.ts';
import { boardPath, navigate } from '../app/router.ts';
import type { Identity } from '../editor/presence.ts';
import { showToast } from '../lib/toasts.ts';
import { Wordmark } from '../ui/Wordmark.tsx';
import { BoardEditor } from './BoardEditor.tsx';
import { useSyncStatus } from './useSyncStatus.ts';
import { openSession, type BoardSession } from './session.ts';

/** Opens a board session for the room in the URL and shows loading and error states around it. */
export function BoardPage({ roomId }: { roomId: string }) {
  const [opened, setOpened] = useState<BoardSession | null>(null);
  const [identity, setIdentity] = useState<Identity>(loadIdentity);

  useEffect(() => {
    const session = openSession(roomId);
    let alive = true;
    // The editor appears once the local copy is in the doc, so it never
    // flashes an empty board before cached shapes arrive.
    void session.localCopy.then((copy) => {
      if (!alive) return;
      setOpened(session);
      if (copy === 'unavailable') {
        showToast({
          message:
            'This browser is not keeping an offline copy, so offline edits will not survive a reload.',
        });
      }
    });
    return () => {
      alive = false;
      session.destroy();
    };
  }, [roomId]);

  const session = opened?.roomId === roomId ? opened : null;
  if (!session) return <BoardLoading />;
  return <BoardGate session={session} identity={identity} onIdentityChange={setIdentity} />;
}

function BoardGate(props: {
  session: BoardSession;
  identity: Identity;
  onIdentityChange: (i: Identity) => void;
}) {
  const status = useSyncStatus(props.session.provider);
  if (status.phase === 'rejected') return <BoardRejected code={status.closeCode} />;
  return <BoardEditor {...props} />;
}

function BoardLoading() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Most boards open from IndexedDB in a few milliseconds; only show this if it takes a while.
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="board surface centered-state" aria-busy="true">
      {visible && (
        <div className="loading-card" role="status">
          <Wordmark animate className="loading-mark" title="Opening board" />
          <p>Opening the board</p>
        </div>
      )}
    </main>
  );
}

function BoardRejected({ code }: { code: number | null }) {
  const message =
    code === CLOSE_ROOM_FULL
      ? 'This board is full right now. Try again in a little while.'
      : code === CLOSE_FORBIDDEN_ORIGIN
        ? 'This server only accepts boards opened from its own address.'
        : 'The server could not open a board at this link.';
  return (
    <main className="board surface centered-state">
      <div className="state-card">
        <h1>This board can't be opened</h1>
        <p>{message}</p>
        <div className="state-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(boardPath(newRoomId()))}
          >
            Start a new board
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to start
          </button>
        </div>
      </div>
    </main>
  );
}
