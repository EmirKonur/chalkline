import {
  ArrowUpRightIcon,
  CircleIcon,
  CursorIcon,
  EraserIcon,
  HandIcon,
  LineSegmentIcon,
  NoteBlankIcon,
  ScribbleIcon,
  SquareIcon,
  TextTIcon,
  type Icon,
} from '@phosphor-icons/react';
import { TOOL_KEYS } from '../editor/shortcuts.ts';
import type { Editor } from '../editor/editor.ts';
import type { ToolId } from '../editor/state.ts';
import { useStore } from '../lib/store.ts';
import { IconButton } from '../ui/IconButton.tsx';

const GROUPS: { tool: ToolId; label: string; icon: Icon }[][] = [
  [
    { tool: 'select', label: 'Select', icon: CursorIcon },
    { tool: 'hand', label: 'Hand', icon: HandIcon },
  ],
  [
    { tool: 'pen', label: 'Chalk pen', icon: ScribbleIcon },
    { tool: 'eraser', label: 'Eraser', icon: EraserIcon },
  ],
  [
    { tool: 'rect', label: 'Rectangle', icon: SquareIcon },
    { tool: 'ellipse', label: 'Ellipse', icon: CircleIcon },
    { tool: 'line', label: 'Line', icon: LineSegmentIcon },
    { tool: 'arrow', label: 'Arrow', icon: ArrowUpRightIcon },
  ],
  [
    { tool: 'text', label: 'Text', icon: TextTIcon },
    { tool: 'sticky', label: 'Sticky note', icon: NoteBlankIcon },
  ],
];

/** The tool rail on the left edge. */
export function Toolbar({ editor }: { editor: Editor }) {
  const active = useStore(editor.store, (s) => s.tool);
  return (
    <nav className="palette tool-rail" aria-label="Tools">
      {GROUPS.map((group, i) => (
        <div className="tool-group" key={i} role="group">
          {group.map(({ tool, label, icon: ToolIcon }) => (
            <IconButton
              key={tool}
              label={label}
              keys={[TOOL_KEYS[tool]]}
              pressed={active === tool}
              onClick={() => editor.setTool(tool)}
              tip="right"
              testId={`tool-${tool}`}
            >
              <ToolIcon size={21} weight={active === tool ? 'fill' : 'regular'} />
            </IconButton>
          ))}
        </div>
      ))}
    </nav>
  );
}
