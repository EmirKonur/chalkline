import { useEffect } from 'react';
import { CLIPBOARD_MIME } from '../editor/clipboard.ts';
import type { Editor } from '../editor/editor.ts';
import { handleShortcut, type ShortcutContext } from '../editor/shortcuts.ts';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

/** Global keyboard shortcuts, Space-to-pan, and clipboard for the board. */
export function useBoardInput(
  editor: Editor,
  ctx: Omit<ShortcutContext, 'editor'>,
  enabled: boolean,
): void {
  const { toggleCheatsheet, toggleTheme, exportPng } = ctx;
  useEffect(() => {
    if (!enabled) return;
    const shortcutCtx: ShortcutContext = { editor, toggleCheatsheet, toggleTheme, exportPng };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.defaultPrevented) return;
      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) editor.setSpacePan(true);
        return;
      }
      if (handleShortcut(e, shortcutCtx)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') editor.setSpacePan(false);
    };
    const onBlur = () => editor.setSpacePan(false);
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement)) return;
      const data = e.type === 'cut' ? editor.cutSelection() : editor.copySelection();
      if (!data || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData(CLIPBOARD_MIME, data);
      e.clipboardData.setData('text/plain', data);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(document.activeElement) || !e.clipboardData) return;
      e.preventDefault();
      editor.paste(e.clipboardData.getData(CLIPBOARD_MIME), e.clipboardData.getData('text/plain'));
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [editor, enabled, toggleCheatsheet, toggleTheme, exportPng]);
}
