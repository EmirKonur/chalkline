import type { Tool } from './tool.ts';

/** Panning itself is handled by the editor, which pans for any drag while this tool is active. */
export class HandTool implements Tool {
  readonly cursor = 'grab';
  down(): void {}
  move(): void {}
  up(): void {}
  cancel(): void {}
}
