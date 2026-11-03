import type { ReactNode } from 'react';
import { keyLabel } from '../editor/shortcuts.ts';

interface Props {
  label: string;
  /** Shortcut keys shown in the tooltip, e.g. ['Mod', 'Z']. */
  keys?: readonly string[];
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  tip?: 'right' | 'top' | 'bottom' | 'bottom-end' | 'left';
  className?: string;
  testId?: string;
}

/** Square icon button with an accessible name and a tooltip that shows its shortcut. */
export function IconButton({
  label,
  keys,
  pressed,
  disabled,
  onClick,
  children,
  tip = 'bottom',
  className,
  testId,
}: Props) {
  const shortcut = keys?.map(keyLabel).join(' ');
  return (
    <button
      type="button"
      className={`icon-btn${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={keys?.join('+').replace('Mod', 'Control')}
      disabled={disabled}
      onClick={onClick}
      data-tip={shortcut ? `${label}  ${shortcut}` : label}
      data-tip-side={tip}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
