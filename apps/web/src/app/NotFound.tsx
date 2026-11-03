import { newRoomId } from '@chalkline/core';
import { useEffect } from 'react';
import { boardPath, navigate } from './router.ts';

export function NotFound() {
  useEffect(() => {
    document.title = 'Nothing here · Chalkline';
  }, []);
  return (
    <main className="surface centered-state">
      <div className="state-card">
        <svg className="smudge" viewBox="0 0 240 90" aria-hidden="true">
          <path d="M20 58C60 20 100 72 140 44S200 18 222 40" pathLength={1} />
          <path d="M36 70C84 52 128 78 176 60" pathLength={1} />
        </svg>
        <p className="eyebrow">404</p>
        <h1>Nothing written here.</h1>
        <p>
          This page was wiped clean, or it never existed. Boards live at addresses like{' '}
          <code>/b/7kq2mfh4xp</code>.
        </p>
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
