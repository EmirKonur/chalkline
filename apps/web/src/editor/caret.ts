/** A Y.Text delta: retain, insert, or delete runs over the previous text. */
export type TextDelta = readonly { retain?: number; insert?: unknown; delete?: number }[];

/**
 * Moves a caret index in the old text to where the same spot is in the new
 * text after a remote edit, so a collaborator typing earlier in the same
 * note does not yank the local caret around. Insertions exactly at the
 * caret land before it, as if the remote user typed first.
 */
export function transformIndex(index: number, delta: TextDelta): number {
  let oldPos = 0;
  let result = index;
  for (const op of delta) {
    if (op.retain !== undefined) {
      oldPos += op.retain;
    } else if (op.insert !== undefined) {
      const length = typeof op.insert === 'string' ? op.insert.length : 1;
      if (oldPos <= index) result += length;
    } else if (op.delete !== undefined) {
      if (oldPos < index) result -= Math.min(op.delete, index - oldPos);
      oldPos += op.delete;
    }
    if (oldPos > index) break;
  }
  return Math.max(0, result);
}
