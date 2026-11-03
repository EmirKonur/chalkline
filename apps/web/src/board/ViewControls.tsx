import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  CornersOutIcon,
  MinusIcon,
  PlusIcon,
} from '@phosphor-icons/react';
import type { Editor } from '../editor/editor.ts';
import { useStore } from '../lib/store.ts';
import { IconButton } from '../ui/IconButton.tsx';

/** Undo/redo and zoom, bottom right. */
export function ViewControls({ editor }: { editor: Editor }) {
  const zoom = useStore(editor.store, (s) => s.camera.zoom);
  const canUndo = useStore(editor.history.state, (s) => s.canUndo);
  const canRedo = useStore(editor.history.state, (s) => s.canRedo);
  return (
    <div className="view-controls">
      <div className="palette palette-row" role="group" aria-label="History">
        <IconButton
          label="Undo"
          keys={['Mod', 'Z']}
          disabled={!canUndo}
          onClick={() => editor.undo()}
          tip="top"
        >
          <ArrowArcLeftIcon size={19} />
        </IconButton>
        <IconButton
          label="Redo"
          keys={['Mod', 'Shift', 'Z']}
          disabled={!canRedo}
          onClick={() => editor.redo()}
          tip="top"
        >
          <ArrowArcRightIcon size={19} />
        </IconButton>
      </div>
      <div className="palette palette-row" role="group" aria-label="Zoom">
        <IconButton label="Zoom out" keys={['-']} onClick={() => editor.zoomStep(-1)} tip="top">
          <MinusIcon size={18} />
        </IconButton>
        <button
          type="button"
          className="zoom-readout"
          onClick={() => editor.resetZoom()}
          aria-label={`Zoom ${Math.round(zoom * 100)} percent. Reset to 100 percent`}
          data-tip="Reset to 100%"
          data-tip-side="top"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" keys={['+']} onClick={() => editor.zoomStep(1)} tip="top">
          <PlusIcon size={18} />
        </IconButton>
        <IconButton
          label="Zoom to fit"
          keys={['Shift', '1']}
          onClick={() => editor.zoomToFit()}
          tip="top"
        >
          <CornersOutIcon size={19} />
        </IconButton>
      </div>
    </div>
  );
}
