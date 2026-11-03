import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Renders the trigger; spread the props onto a button. */
  trigger: (props: {
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
    ref: (node: HTMLButtonElement | null) => void;
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  label: string;
  className?: string;
}

/** A click-to-open panel that closes on Escape or an outside click and returns focus to its trigger. */
export function Popover({ trigger, children, align = 'end', label, className }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        anchor?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    const first = root.current?.querySelector<HTMLElement>(
      '[data-autofocus], [role="menuitem"], input, button:not([aria-controls])',
    );
    first?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor]);

  const close = () => {
    setOpen(false);
    anchor?.focus();
  };

  return (
    <div className={`popover-root${className ? ` ${className}` : ''}`} ref={root}>
      {trigger({
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => setOpen((v) => !v),
        ref: setAnchor,
      })}
      {open && (
        <div id={id} className={`palette popover popover-${align}`} aria-label={label}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
