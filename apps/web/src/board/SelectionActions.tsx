import {
  CopySimpleIcon,
  PencilSimpleLineIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { worldToScreen } from '../geometry/camera.ts';
import type { Editor } from '../editor/editor.ts';
import { useStore } from '../lib/store.ts';
import { IconButton } from '../ui/IconButton.tsx';
import { useSceneTick } from './useShapeVersion.ts';

const GAP = 14;

/** A small action bar that floats above the selection. */
export function SelectionActions({ editor }: { editor: Editor }) {
  const selection = useStore(editor.store, (s) => s.selection);
  const camera = useStore(editor.store, (s) => s.camera);
  const viewport = useStore(editor.store, (s) => s.viewport);
  const busy = useStore(editor.store, (s) => s.pointerActive || s.editing !== null);
  const tool = useStore(editor.store, (s) => s.tool);
  useSceneTick(editor);
  if (selection.size === 0 || busy || tool !== 'select') return null;
  const bounds = editor.selectionBounds();
  if (!bounds) return null;

  const top = worldToScreen(camera, { x: bounds.x + bounds.w / 2, y: bounds.y });
  const bottom = worldToScreen(camera, { x: bounds.x, y: bounds.y + bounds.h });
  const above = top.y > 120;
  const y = above ? top.y - GAP : bottom.y + GAP;
  const x = Math.min(Math.max(top.x, 140), viewport.width - 140);
  const [only] = editor.selectedShapes();
  const editable = selection.size === 1 && (only?.kind === 'text' || only?.kind === 'sticky');

  return (
    <div
      className={`palette palette-row selection-actions ${above ? 'is-above' : 'is-below'}`}
      style={{ left: x, top: y }}
      role="toolbar"
      aria-label="Selection"
    >
      {editable && only && (
        <IconButton
          label="Edit text"
          keys={['Enter']}
          onClick={() => editor.startEditing(only.id)}
          tip="top"
        >
          <PencilSimpleLineIcon size={18} />
        </IconButton>
      )}
      <IconButton
        label="Duplicate"
        keys={['Mod', 'D']}
        onClick={() => editor.duplicateSelection()}
        tip="top"
      >
        <CopySimpleIcon size={18} />
      </IconButton>
      <IconButton
        label="Bring to front"
        keys={['Shift', ']']}
        onClick={() => editor.arrange('front')}
        tip="top"
      >
        <ArrowLineUpIcon size={18} />
      </IconButton>
      <IconButton
        label="Send to back"
        keys={['Shift', '[']}
        onClick={() => editor.arrange('back')}
        tip="top"
      >
        <ArrowLineDownIcon size={18} />
      </IconButton>
      <IconButton
        label="Delete"
        keys={['Delete']}
        onClick={() => editor.deleteSelection()}
        tip="top"
        className="is-danger"
      >
        <TrashIcon size={18} />
      </IconButton>
    </div>
  );
}
