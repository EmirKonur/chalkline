import { Editor } from '../editor/editor.ts';
import { Presence, type Identity } from '../editor/presence.ts';
import { Scene } from '../editor/scene.ts';
import { showToast } from '../lib/toasts.ts';
import { createCanvasMeasure } from '../render/measure.ts';
import { BOARD_FONT, BOARD_FONT_WEIGHT } from '../geometry/text.ts';
import type { ThemeName } from '../theme/palette.ts';
import type { BoardSession } from './session.ts';

export interface EditorStack {
  editor: Editor;
  destroy(): void;
}

/** Builds the editor for a session: undo history, scene mirror, presence, and the editor itself. */
export function createEditorStack(
  session: BoardSession,
  identity: Identity,
  theme: ThemeName,
): EditorStack {
  const text = createCanvasMeasure();
  let editor: Editor | null = null;
  const { history } = session;
  history.bindSelection(
    () => [...(editor?.state.selection ?? [])],
    (ids) => editor?.select(ids),
  );
  const scene = new Scene(session.board, text.measure, (origin) => history.isLocal(origin));
  const presence = new Presence(session.awareness, identity);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  editor = new Editor({
    board: session.board,
    history,
    scene,
    presence,
    measure: text.measure,
    theme,
    notify: showToast,
    reducedMotion: () => reducedMotion.matches,
  });

  // Text is measured with the board font; until it loads, widths come from a
  // fallback font, so everything is measured again once it arrives.
  const remeasure = () => {
    text.reset();
    scene.remeasure();
  };
  let alive = true;
  void document.fonts.load(`${BOARD_FONT_WEIGHT} 26px ${BOARD_FONT}`).then(() => {
    if (alive) remeasure();
  });
  document.fonts.addEventListener('loadingdone', remeasure);

  const created = editor;
  return {
    editor: created,
    destroy() {
      alive = false;
      document.fonts.removeEventListener('loadingdone', remeasure);
      created.destroy();
      presence.destroy();
      scene.destroy();
    },
  };
}
