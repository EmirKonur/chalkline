import type { Editor } from '../editor.ts';
import type { BoardPointer, Tool } from './tool.ts';

export const STICKY_SIZE = 200;

/** Click to start typing; the text shape is only created once there is text. */
export class TextTool implements Tool {
  readonly cursor = 'text';
  private readonly editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  down(p: BoardPointer): void {
    this.editor.startDraft(p.world);
  }

  move(): void {}
  up(): void {}
  cancel(): void {}
}

/** Click to drop a sticky note centered on the pointer and start writing on it. */
export class StickyTool implements Tool {
  readonly cursor = 'copy';
  private readonly editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  down(p: BoardPointer): void {
    const { history, board } = this.editor;
    const { ink, size } = this.editor.state.style;
    history.cut();
    const id = board.create({
      kind: 'sticky',
      x: p.world.x - STICKY_SIZE / 2,
      y: p.world.y - STICKY_SIZE / 2,
      w: STICKY_SIZE,
      h: STICKY_SIZE,
      text: '',
      ink: ink === 'chalk' ? 'butter' : ink,
      size,
    });
    history.cut();
    this.editor.startEditing(id);
  }

  move(): void {}
  up(): void {}
  cancel(): void {}
}
