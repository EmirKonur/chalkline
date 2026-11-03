import {
  DotsThreeOutlineIcon,
  DownloadSimpleIcon,
  FilePlusIcon,
  GridFourIcon,
  KeyboardIcon,
  MoonIcon,
  SunIcon,
} from '@phosphor-icons/react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { keyLabel } from '../editor/shortcuts.ts';
import type { Editor } from '../editor/editor.ts';
import { useStore } from '../lib/store.ts';
import { Popover } from '../ui/Popover.tsx';

interface Props {
  editor: Editor;
  onExportPng: () => void;
  onExportSvg: () => void;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
  onNewBoard: () => void;
}

/** Arrow keys move between menu items, as in a native menu. */
function onMenuKey(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
  next?.focus();
}

function Item({
  icon,
  label,
  keys,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  keys?: string[];
  onSelect: () => void;
}) {
  return (
    <button type="button" role="menuitem" className="menu-item" onClick={onSelect}>
      <span className="menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="menu-label">{label}</span>
      {keys && <kbd className="menu-keys">{keys.map(keyLabel).join(' ')}</kbd>}
    </button>
  );
}

export function BoardMenu({
  editor,
  onExportPng,
  onExportSvg,
  onToggleTheme,
  onShowShortcuts,
  onNewBoard,
}: Props) {
  const theme = useStore(editor.store, (s) => s.theme);
  const grid = useStore(editor.store, (s) => s.grid);
  const hasSelection = useStore(editor.store, (s) => s.selection.size > 0);
  const scope = hasSelection ? 'selection' : 'board';
  return (
    <Popover
      label="Board menu"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className="icon-btn"
          aria-label="Board menu"
          aria-haspopup="menu"
          data-tip="Menu"
          data-tip-side="bottom-end"
        >
          <DotsThreeOutlineIcon size={20} weight="fill" />
        </button>
      )}
    >
      {(close) => {
        const run = (fn: () => void) => () => {
          close();
          fn();
        };
        return (
          <div role="menu" aria-label="Board menu" className="menu" onKeyDown={onMenuKey}>
            <Item
              icon={<DownloadSimpleIcon size={18} />}
              label={`Export ${scope} as PNG`}
              keys={['Mod', 'Shift', 'E']}
              onSelect={run(onExportPng)}
            />
            <Item
              icon={<DownloadSimpleIcon size={18} />}
              label={`Export ${scope} as SVG`}
              onSelect={run(onExportSvg)}
            />
            <div className="menu-sep" role="separator" />
            <Item
              icon={theme === 'chalkboard' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
              label={theme === 'chalkboard' ? 'Switch to whiteboard' : 'Switch to chalkboard'}
              keys={['Shift', 'T']}
              onSelect={run(onToggleTheme)}
            />
            <Item
              icon={<GridFourIcon size={18} />}
              label={grid ? 'Hide dot grid' : 'Show dot grid'}
              keys={['G']}
              onSelect={run(() => editor.toggleGrid())}
            />
            <Item
              icon={<KeyboardIcon size={18} />}
              label="Keyboard shortcuts"
              keys={['?']}
              onSelect={run(onShowShortcuts)}
            />
            <div className="menu-sep" role="separator" />
            <Item icon={<FilePlusIcon size={18} />} label="New board" onSelect={run(onNewBoard)} />
          </div>
        );
      }}
    </Popover>
  );
}
