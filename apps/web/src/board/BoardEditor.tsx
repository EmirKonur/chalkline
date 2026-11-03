import { compareStacked, newRoomId } from '@chalkline/core';
import { LinkSimpleIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { boardPath, navigate } from '../app/router.ts';
import { rememberBoard } from '../app/recent.ts';
import type { Editor } from '../editor/editor.ts';
import type { Identity } from '../editor/presence.ts';
import { downloadBlob, exportPng } from '../export/png.ts';
import { exportSvg } from '../export/svg.ts';
import type { Camera } from '../geometry/camera.ts';
import { readJson, writeJson } from '../lib/storage.ts';
import { useStore } from '../lib/store.ts';
import { showToast } from '../lib/toasts.ts';
import { PALETTES } from '../theme/palette.ts';
import { toggleTheme, useTheme } from '../theme/theme.ts';
import { LogoMark } from '../ui/Wordmark.tsx';
import { BoardMenu } from './BoardMenu.tsx';
import { CanvasView } from './CanvasView.tsx';
import { Cheatsheet } from './Cheatsheet.tsx';
import { ConnectionStatus } from './ConnectionStatus.tsx';
import { createEditorStack } from './createStack.ts';
import { EmptyState } from './EmptyState.tsx';
import { PresenceList } from './PresenceList.tsx';
import { RemoteCursors } from './RemoteCursors.tsx';
import type { BoardSession } from './session.ts';
import { SelectionActions } from './SelectionActions.tsx';
import { TextEditor } from './TextEditor.tsx';
import { TitleField } from './TitleField.tsx';
import { Toolbar } from './Toolbar.tsx';
import { Tray } from './Tray.tsx';
import { useBoardInput } from './useBoardInput.ts';
import { useBoardTitle } from './useBoardTitle.ts';
import { useShapeCount } from './useShapeVersion.ts';
import { ViewControls } from './ViewControls.tsx';

interface Props {
  session: BoardSession;
  identity: Identity;
  onIdentityChange: (identity: Identity) => void;
}

export function BoardEditor(props: Props) {
  const theme = useTheme();
  const [editor, setEditor] = useState<Editor | null>(null);
  const { session, identity } = props;
  // The stack lives as long as the session; later identity and theme changes are pushed below.
  const initial = useRef({ identity, theme });

  useEffect(() => {
    const stack = createEditorStack(session, initial.current.identity, initial.current.theme);
    setEditor(stack.editor);
    return () => {
      stack.destroy();
      setEditor(null);
    };
  }, [session]);

  useEffect(() => editor?.presence.setIdentity(identity), [editor, identity]);
  useEffect(() => editor?.setTheme(theme), [editor, theme]);

  return editor ? <BoardLayout {...props} editor={editor} /> : null;
}

const FIT_WINDOW_MS = 3000;

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function BoardLayout({ session, identity, onIdentityChange, editor }: Props & { editor: Editor }) {
  const [cheatsheet, setCheatsheet] = useState(false);
  const title = useBoardTitle(session.board);
  const count = useShapeCount(editor);
  const editSession = useStore(editor.store, (s) => s.editSession);
  const editing = useStore(editor.store, (s) => s.editing !== null);
  const peers = useStore(editor.presence.peers, (s) => s.list.length);

  useEffect(() => {
    document.title = `${title || 'Untitled board'} · Chalkline`;
    rememberBoard(session.roomId, title);
  }, [title, session.roomId]);

  // Camera: restore where this browser last looked at the board. Otherwise
  // fit the content that arrives from IndexedDB or the first sync, but only
  // briefly after opening and never once this user has started drawing.
  useEffect(() => {
    const key = `chalkline:camera:${session.roomId}`;
    const saved = readJson<Camera | null>(key, null);
    const valid =
      saved !== null && [saved.x, saved.y, saved.zoom].every(Number.isFinite) && saved.zoom > 0;
    const opened = performance.now();
    let fitted = valid;
    let centered = false;
    let lastCamera = editor.camera;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const tryFit = () => {
      if (fitted || editor.state.viewport.width === 0) return;
      if (performance.now() - opened > FIT_WINDOW_MS) {
        fitted = true;
      } else if (editor.scene.size > 0) {
        editor.zoomToFit(false);
        fitted = true;
      } else if (!centered) {
        centered = true;
        editor.zoomToFit(false);
      }
    };
    if (valid) editor.setCamera(saved);
    const offStore = editor.store.subscribe(() => {
      if (!centered) tryFit();
      if (editor.camera !== lastCamera) {
        lastCamera = editor.camera;
        clearTimeout(writeTimer);
        writeTimer = setTimeout(() => writeJson(key, editor.camera), 400);
      }
    });
    const offScene = editor.scene.subscribe((change) => {
      if (change.local) fitted = true;
      else tryFit();
    });
    tryFit();
    return () => {
      offStore();
      offScene();
      clearTimeout(writeTimer);
    };
  }, [editor, session.roomId]);

  const exportAs = useCallback(
    async (format: 'png' | 'svg') => {
      const shapes =
        editor.state.selection.size > 0
          ? editor.selectedShapes().sort(compareStacked)
          : editor.scene.ordered().map((entry) => entry.shape);
      if (shapes.length === 0) {
        showToast({ message: 'Nothing to export yet. Draw something first.' });
        return;
      }
      const palette = PALETTES[editor.state.theme];
      const name = slug(session.board.title) || `chalkline-${session.roomId}`;
      try {
        const blob =
          format === 'png'
            ? await exportPng(shapes, palette, editor.measure)
            : new Blob([exportSvg(shapes, palette, editor.measure)], { type: 'image/svg+xml' });
        downloadBlob(blob, `${name}.${format}`);
      } catch {
        showToast({ message: 'The export failed. Try exporting a smaller selection.' });
      }
    },
    [editor, session],
  );

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(location.href).then(
      () => showToast({ message: 'Invite link copied. Anyone with it can draw on this board.' }),
      () => showToast({ message: 'Could not reach the clipboard. Copy the address bar instead.' }),
    );
  }, []);

  const toggleCheatsheet = useCallback(() => setCheatsheet((open) => !open), []);
  const exportPngShortcut = useCallback(() => void exportAs('png'), [exportAs]);
  useBoardInput(
    editor,
    { toggleCheatsheet, toggleTheme, exportPng: exportPngShortcut },
    !cheatsheet,
  );

  return (
    <div className="board surface">
      <CanvasView editor={editor} />
      <RemoteCursors editor={editor} />
      {editing && <TextEditor key={editSession} editor={editor} />}
      {count === 0 && !editing && <EmptyState onCopyLink={copyLink} />}

      <header className="topbar">
        <div className="palette topbar-cluster">
          <a
            href="/"
            className="brand"
            aria-label="Chalkline home"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            <LogoMark size={30} />
          </a>
          <TitleField editor={editor} />
        </div>
        <div className="palette topbar-cluster">
          <PresenceList editor={editor} identity={identity} onIdentityChange={onIdentityChange} />
          <ConnectionStatus provider={session.provider} peers={peers} />
          <button
            type="button"
            className="btn btn-primary btn-small share-btn"
            onClick={copyLink}
            data-tip="Copy the board link"
            data-tip-side="bottom-end"
          >
            <LinkSimpleIcon size={16} weight="bold" aria-hidden="true" />
            Share
          </button>
          <BoardMenu
            editor={editor}
            onExportPng={() => void exportAs('png')}
            onExportSvg={() => void exportAs('svg')}
            onToggleTheme={toggleTheme}
            onShowShortcuts={() => setCheatsheet(true)}
            onNewBoard={() => navigate(boardPath(newRoomId()))}
          />
        </div>
      </header>

      <Toolbar editor={editor} />
      <Tray editor={editor} />
      <ViewControls editor={editor} />
      <SelectionActions editor={editor} />
      <Cheatsheet open={cheatsheet} onClose={() => setCheatsheet(false)} />
    </div>
  );
}
