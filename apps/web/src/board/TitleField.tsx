import { useState } from 'react';
import type { Editor } from '../editor/editor.ts';
import { useBoardTitle } from './useBoardTitle.ts';

/** The board name, editable in place and shared with everyone on the board. */
export function TitleField({ editor }: { editor: Editor }) {
  const title = useBoardTitle(editor.board);
  // While focused, the field holds a local draft so a remote rename does not
  // overwrite what this user is typing; otherwise it shows the shared title.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? title;

  const commit = () => {
    if (draft !== null && draft.trim() !== title) editor.change(() => editor.board.setTitle(draft));
    setDraft(null);
  };

  return (
    <input
      className="title-field"
      aria-label="Board name"
      placeholder="Untitled board"
      value={value}
      maxLength={80}
      size={Math.max(12, Math.min(32, (value || 'Untitled board').length + 1))}
      onFocus={() => setDraft(title)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(title);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
