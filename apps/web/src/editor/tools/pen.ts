import type { Editor } from '../editor.ts';
import type { BoardPointer, Tool } from './tool.ts';

/** Minimum spacing between stored points, in screen pixels. */
const MIN_STEP_PX = 1.2;

/**
 * Freehand strokes stream into the document while they are drawn, so
 * collaborators watch the line appear instead of seeing it pop in on
 * pointer up. Points go into a Y.Array as integers, which Yjs merges into a
 * single item per run of appends from one client.
 */
export class PenTool implements Tool {
  readonly cursor = 'crosshair';
  private id: string | null = null;
  private origin = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  private readonly editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
  }

  down(p: BoardPointer): void {
    const { board, history } = this.editor;
    const { ink, size } = this.editor.state.style;
    history.cut();
    this.origin = p.world;
    this.last = p.world;
    this.id = board.create({
      kind: 'pen',
      x: p.world.x,
      y: p.world.y,
      points: [0, 0, pressureOf(p)],
      realPressure: p.pointerType === 'pen',
      sx: 1,
      sy: 1,
      ink,
      size,
    });
  }

  move(p: BoardPointer): void {
    if (!this.id) return;
    const minStep = MIN_STEP_PX / this.editor.camera.zoom;
    const points: number[] = [];
    for (const sample of p.samples) {
      if (Math.hypot(sample.world.x - this.last.x, sample.world.y - this.last.y) < minStep)
        continue;
      this.last = sample.world;
      points.push(
        sample.world.x - this.origin.x,
        sample.world.y - this.origin.y,
        p.pointerType === 'pen' ? sample.pressure : 0.5,
      );
    }
    this.editor.board.appendPoints(this.id, points);
  }

  up(): void {
    this.id = null;
    this.editor.history.cut();
  }

  cancel(): void {
    if (this.id) this.editor.board.remove([this.id]);
    this.id = null;
    this.editor.history.cut();
  }

  removed(ids: ReadonlySet<string>): void {
    if (this.id && ids.has(this.id)) {
      this.id = null;
      this.editor.notify({ message: 'Someone erased the stroke you were drawing.' });
    }
  }
}

function pressureOf(p: BoardPointer): number {
  return p.pointerType === 'pen' ? p.pressure : 0.5;
}
