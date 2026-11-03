import { newRoomId } from '@chalkline/core';
import { ArrowRightIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Wordmark } from '../ui/Wordmark.tsx';
import { forgetBoard, loadRecent, timeAgo, type RecentBoard } from './recent.ts';
import { boardPath, navigate, roomFromInput } from './router.ts';

export function Landing() {
  const [recent, setRecent] = useState<RecentBoard[]>(loadRecent);
  const [join, setJoin] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Chalkline · a shared chalkboard';
  }, []);

  const open = (id: string) => navigate(boardPath(id));

  return (
    <main className="landing surface">
      <LandingDoodle />
      <div className="landing-inner">
        <section className="landing-hero" aria-labelledby="landing-title">
          <Wordmark animate className="landing-wordmark" />
          <h1 id="landing-title" className="landing-title">
            A shared chalkboard you open with a link.
          </h1>
          <p className="landing-copy">
            Sketch a system design, run a retro, or talk something through with boxes and arrows.
            Everyone with the link draws at the same time, and the board keeps working when the
            connection does not.
          </p>
          <div className="landing-actions">
            <button
              type="button"
              className="btn btn-primary btn-large"
              onClick={() => open(newRoomId())}
              data-testid="new-board"
            >
              <PlusIcon size={20} weight="bold" aria-hidden="true" />
              Start a new board
            </button>
            <form
              className="join-form"
              onSubmit={(e) => {
                e.preventDefault();
                const id = roomFromInput(join);
                if (id) open(id);
                else setJoinError('That does not look like a board link or code.');
              }}
            >
              <label htmlFor="join-input" className="visually-hidden">
                Board link or code
              </label>
              <input
                id="join-input"
                className="text-input"
                placeholder="Paste a board link or code"
                value={join}
                onChange={(e) => {
                  setJoin(e.target.value);
                  setJoinError(null);
                }}
                aria-invalid={joinError !== null}
                aria-describedby={joinError ? 'join-error' : undefined}
              />
              <button type="submit" className="btn btn-secondary" aria-label="Open board">
                <ArrowRightIcon size={18} weight="bold" aria-hidden="true" />
              </button>
            </form>
            {joinError && (
              <p id="join-error" className="field-error" role="alert">
                {joinError}
              </p>
            )}
          </div>
          <ul className="landing-notes">
            <li>Live cursors, so you can point at things while you talk.</li>
            <li>Draw offline; it merges the moment you reconnect.</li>
            <li>Undo only ever undoes your own strokes.</li>
          </ul>
        </section>

        <aside className="palette recent-card" aria-labelledby="recent-title">
          <h2 id="recent-title">Recent boards</h2>
          {recent.length === 0 ? (
            <p className="recent-empty">
              Boards you open in this browser show up here. A board lives at its link, so bookmark
              the ones you want to come back to.
            </p>
          ) : (
            <ul className="recent-list">
              {recent.map((board) => (
                <li key={board.id} className="recent-item">
                  <a
                    href={boardPath(board.id)}
                    onClick={(e) => {
                      e.preventDefault();
                      open(board.id);
                    }}
                  >
                    <span className="recent-title">{board.title || 'Untitled board'}</span>
                    <span className="recent-meta">
                      {board.id} · {timeAgo(board.visitedAt)}
                    </span>
                  </a>
                  <button
                    type="button"
                    className="icon-btn icon-btn-small"
                    aria-label={`Remove ${board.title || board.id} from recent boards`}
                    data-tip="Forget in this browser"
                    data-tip-side="left"
                    onClick={() => {
                      forgetBoard(board.id);
                      setRecent(loadRecent());
                    }}
                  >
                    <XIcon size={14} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      <footer className="landing-foot">
        Boards are open to anyone who has the link. There are no accounts and nothing to sign up
        for.
      </footer>
    </main>
  );
}

/** A faint chalk sketch in the corner of the landing page: two boxes, an arrow, a sticky. */
function LandingDoodle() {
  const strokes = [
    'M40 60h150a10 10 0 0 1 10 10v70a10 10 0 0 1-10 10H40a10 10 0 0 1-10-10V70a10 10 0 0 1 10-10Z',
    'M330 120h150a10 10 0 0 1 10 10v70a10 10 0 0 1-10 10H330a10 10 0 0 1-10-10v-70a10 10 0 0 1 10-10Z',
    'M206 108C250 100 280 120 314 150',
    'M296 150l18 1-6-17',
    'M70 104h90M70 120h60',
    'M360 164h90M360 180h50',
  ];
  return (
    <svg className="landing-doodle" viewBox="0 0 520 260" aria-hidden="true">
      {strokes.map((d, i) => (
        <path key={d} d={d} pathLength={1} style={{ animationDelay: `${900 + i * 160}ms` }} />
      ))}
    </svg>
  );
}
